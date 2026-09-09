import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { endpoints, type ComponentSummary, type UploadResult } from '@/lib/api'
import { fmt } from '@/lib/utils'

export function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<UploadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ComponentSummary[] | null>(null)

  async function loadFile(selected: File) {
    if (!selected.size) {
      toast.error('The selected file is empty.')
      return
    }
    setFile(selected)
    setPreview(null)
    setResults(null)
    setBusy(true)
    try {
      const loaded = await endpoints.upload(selected)
      setPreview(loaded)
      if (loaded.errors.length) toast.error(loaded.errors[0])
      else toast.success(`Dataset loaded: ${loaded.rows.toLocaleString()} rows.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dataset upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function runAnalysis() {
    setBusy(true)
    try {
      const analysis = await endpoints.analyze()
      const exp = await endpoints.export()
      setResults(exp.items.filter((item) => item.status !== 'SAFE').slice(0, 40))
      setPreview((current) => current ? { ...current, analysis } : current)
      toast.success(`Analysis complete: ${String(analysis.analyzed ?? 0)} components analyzed.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  async function loadDemo() {
    setBusy(true)
    setFile(null)
    setResults(null)
    try {
      const loaded = await endpoints.demo()
      setPreview(loaded)
      if (loaded.errors.length) toast.error(loaded.errors[0])
      else {
        const exp = await endpoints.export()
        setResults(exp.items.filter((item) => item.status !== 'SAFE').slice(0, 40))
        toast.success('DEMO DATASET — NASA C-MAPSS loaded and analyzed.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demo dataset failed to load.')
    } finally {
      setBusy(false)
    }
  }

  async function clearDataset() {
    setBusy(true)
    try {
      await endpoints.clearDataset()
      setFile(null)
      setPreview(null)
      setResults(null)
      if (inputRef.current) inputRef.current.value = ''
      toast.success('Dataset cleared.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear dataset.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadExport() {
    const exp = await endpoints.export()
    const header = ['component_id', 'batch_id', 'status', 'risk_score', 'anomaly_score', 'predicted_168h', 'recommendation']
    const lines = [header.join(','), ...exp.items.map((item) => header.map((key) => String((item as Record<string, unknown>)[key] ?? '')).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = 'aegis-screening-export.csv'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-snow font-medium">Data intake</h1>
        <p className="text-sm text-muted mt-1">Upload, validate, and analyze an engineering dataset.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Dataset workflow</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-fog">CSV, XLSX, JSON, TXT, and ZIP are supported. C-MAPSS whitespace-separated files are detected automatically.</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json,.txt,.zip"
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0]
              if (selected) void loadFile(selected)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy && !preview ? 'Uploading…' : 'Upload Dataset'}
            </Button>
            <Button variant="outline" onClick={() => void loadDemo()} disabled={busy}>
              Load Demo Dataset
            </Button>
            <Button variant="ghost" onClick={() => void clearDataset()} disabled={busy}>
              Clear Dataset
            </Button>
          </div>
          {preview && (
            <div className="border border-line p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="section-kicker">{preview.schema?.label ?? (file ? file.name : 'Dataset')}</p>
                  <p className="text-sm text-snow">{preview.selected_file ?? file?.name ?? 'Dataset loaded'}</p>
                </div>
                <span className="text-sm text-fog">{preview.rows.toLocaleString()} rows · {preview.components.toLocaleString()} {preview.schema?.schema === 'C-MAPSS' ? 'units' : 'groups/components'}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-fog">
                <span>Columns: {String(preview.metadata?.columns ?? '—')}</span>
                <span>Numeric features: {String(preview.metadata?.numeric_features ?? '—')}</span>
                <span>Missing values: {String(preview.metadata?.missing_total ?? 0)}</span>
                <span>Duplicates: {String(preview.metadata?.duplicate_rows ?? 0)}</span>
              </div>
              {preview.schema?.schema && <p className="text-xs text-muted">Schema detected: {preview.schema.schema.replaceAll('_', ' ')}</p>}
              {preview.warnings.map((warning) => <p key={warning} className="text-sm text-amber-200">{warning}</p>)}
              {preview.errors.map((error) => <p key={error} className="text-sm text-rose-300" role="alert">{error}</p>)}
              {!preview.analysis && !preview.errors.length && (
                <Button onClick={() => void runAnalysis()} disabled={busy}>{busy ? 'Analyzing…' : 'Run Analysis'}</Button>
              )}
              {preview.analysis && preview.schema?.schema !== 'AEGIS_COMPONENT_SCREENING' && (
                <div className="border border-line p-3 text-sm text-fog space-y-1">
                  <p className="text-snow">Analysis summary</p>
                  <p>{String(preview.analysis.analyzed ?? 0)} records analyzed · {String(preview.analysis.anomalies ?? 0)} anomalies</p>
                  <p>{String(preview.analysis.anomaly_percentage ?? 0)}% anomalous · highest score {String(preview.analysis.highest_anomaly_score ?? 0)}/100</p>
                  <p className="text-xs text-muted">{String(preview.analysis.imputation ?? '')}</p>
                </div>
              )}
            </div>
          )}
          {preview?.preview.length ? (
            <div className="overflow-x-auto">
              <table className="text-xs min-w-[720px]">
                <thead><tr className="text-muted">{Object.keys(preview.preview[0]).map((key) => <th key={key} className="text-left p-2">{key}</th>)}</tr></thead>
                <tbody>{preview.preview.map((row, index) => <tr key={index} className="border-t border-line">{Object.values(row).map((value, column) => <td key={column} className="p-2 text-fog">{String(value)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {results && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Detected anomalies / warnings</CardTitle>
            <Button variant="outline" onClick={() => void downloadExport()}>Export results CSV</Button>
          </CardHeader>
          <CardBody className="divide-y divide-line p-0">
            {results.length ? results.map((component) => (
              <Link key={component.component_id} to={`/components/${component.component_id}`} className="flex flex-wrap gap-3 px-4 py-3 hover:bg-white/4">
                <span className="font-mono text-snow">{component.component_id}</span>
                <StatusBadge status={component.status} />
                <span className="text-sm text-fog">risk {fmt(component.risk_score, 0)} · pred {fmt(component.predicted_168h, 1)}</span>
              </Link>
            )) : <p className="p-4 text-muted text-sm">No anomalies detected in the analyzed dataset.</p>}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
