import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { endpoints, type ComponentSummary, type UploadResult } from '@/lib/api'
import { fmt } from '@/lib/utils'

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<UploadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ComponentSummary[] | null>(null)

  async function doPreview() {
    if (!file) return
    setBusy(true)
    try {
      const r = await endpoints.uploadPreview(file)
      setPreview(r)
      if (r.errors.length) toast.error(r.errors[0])
      else toast.success(`Validated ${r.rows} rows / ${r.components} components.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function runUpload() {
    if (!file) return
    setBusy(true)
    try {
      const r = await endpoints.upload(file)
      setPreview(r)
      if (r.errors.length) {
        toast.error(r.errors[0])
        return
      }
      toast.success('Ingested and analyzed.')
      const exp = await endpoints.export()
      setResults(exp.items.filter((i) => i.status !== 'SAFE').slice(0, 40))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function downloadExport() {
    const exp = await endpoints.export()
    const header = ['component_id', 'batch_id', 'status', 'risk_score', 'anomaly_score', 'predicted_168h', 'recommendation']
    const lines = [header.join(','), ...exp.items.map((i) => header.map((h) => String((i as Record<string, unknown>)[h] ?? '')).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'aegis-screening-export.csv'
    a.click()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-snow font-medium">Data intake</h1>
        <p className="text-sm text-muted mt-1">Upload component or telemetry data for validation, analysis, and engineering reporting.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload dataset</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fog">
            Supported formats: CSV, XLSX, XLS, JSON. Required columns: component_id, batch_id, test_hour. Recommended fields include
            temperature, voltage, current, leakage_current, propagation_delay, resistance, and capacitance.
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setPreview(null)
            }}
            className="text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={doPreview} disabled={!file || busy}>
              Preview & validate
            </Button>
            <Button onClick={runUpload} disabled={!file || busy || Boolean(preview?.errors.length)}>
              {busy ? 'Working…' : 'Ingest & run analysis'}
            </Button>
          </div>
          {preview?.errors.map((e) => (
            <p key={e} className="text-sm text-rose-300" role="alert">
              {e}
            </p>
          ))}
          {preview?.warnings.map((e) => (
            <p key={e} className="text-sm text-amber-200">
              {e}
            </p>
          ))}
          {preview && preview.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs min-w-[720px]">
                <thead>
                  <tr className="text-muted">
                    {Object.keys(preview.preview[0]).map((k) => (
                      <th key={k} className="text-left p-2">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="p-2 text-fog">
                          {String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {results && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Detected anomalies / warnings</CardTitle>
            <Button variant="outline" onClick={() => void downloadExport()}>
              Export results CSV
            </Button>
          </CardHeader>
          <CardBody className="divide-y divide-line p-0">
            {results.map((c) => (
              <Link key={c.component_id} to={`/components/${c.component_id}`} className="flex flex-wrap gap-3 px-4 py-3 hover:bg-white/4">
                <span className="font-mono text-snow">{c.component_id}</span>
                <StatusBadge status={c.status} />
                <span className="text-sm text-fog">risk {fmt(c.risk_score, 0)} · pred {fmt(c.predicted_168h, 1)} µA</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
