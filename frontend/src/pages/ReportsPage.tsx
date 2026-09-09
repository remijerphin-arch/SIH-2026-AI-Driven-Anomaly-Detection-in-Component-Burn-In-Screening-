import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ComponentSummary, type DatasetSummary } from '@/lib/api'

export function ReportsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<ComponentSummary[]>([])
  const [reports, setReports] = useState<{ id: number; component_id: string; created_at: string }[]>([])
  const [id, setId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [dataset, setDataset] = useState<DatasetSummary | null>(null)

  useEffect(() => {
    Promise.all([endpoints.components(), endpoints.reports(), endpoints.currentDataset()])
      .then(([c, r, d]) => {
        const flagged = [...c.items].sort((a, b) => b.risk_score - a.risk_score)
        setItems(flagged)
        setId(flagged[0]?.component_id ?? '')
        setReports(r.items)
        setDataset(d)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setReady(true))
  }, [])

  async function create() {
    if (!id) {
      toast.error('No analyzed component is available. Upload and analyze a dataset first.')
      return
    }
    setBusy(true)
    try {
      const r = await endpoints.createReport(id)
      toast.success('Engineering report generated.')
      nav(`/reports/${r.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <ErrorNote message={err} />
  if (!ready) return <Loading />

  if (items.length === 0 && reports.length === 0 && !dataset?.loaded) {
    return (
      <div className="empty-analytics-shell">
        <div className="empty-analytics-panel">
          <p className="section-kicker">REPORTS</p>
          <h1>No reports available</h1>
          <p>Complete an analysis and generate a component engineering report from the uploaded dataset.</p>
          <Button onClick={() => nav('/upload')}>Upload dataset</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-snow font-medium">Screening reports</h1>
        <p className="text-sm text-muted mt-1">Print-friendly HTML reports (use the browser print dialog for PDF).</p>
      </div>
      {dataset?.loaded && items.length === 0 && (
        <Card>
          <CardHeader><CardTitle>Dataset engineering report</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm text-fog">
            <p>{dataset.filename} · {dataset.schema} · {String(dataset.metadata?.rows ?? 0)} records</p>
            <a className="inline-flex rounded-md border border-line px-3.5 py-2 text-snow hover:border-cyan-300" href={endpoints.downloadDatasetReportUrl()} download>Download report</a>
          </CardBody>
        </Card>
      )}
      {items.length === 0 ? (
        <EmptyState title="No components to report." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Generate component screening report</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-3 items-center">
            <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-snow">
              {items.map((c) => (
                <option key={c.component_id} value={c.component_id}>
                  {c.component_id} · {c.status}
                </option>
              ))}
            </select>
            <Button onClick={create} disabled={busy}>
              {busy ? 'Building…' : 'Generate report'}
            </Button>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Recent reports</CardTitle>
        </CardHeader>
        <CardBody className="divide-y divide-line p-0">
          {reports.length === 0 && <p className="p-4 text-muted text-sm">None yet.</p>}
          {reports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="flex justify-between px-4 py-3 hover:bg-white/4">
              <span className="font-mono text-cyan-300">{r.component_id}</span>
              <span className="text-xs text-muted">{r.created_at.replace('T', ' ').slice(0, 19)}</span>
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
