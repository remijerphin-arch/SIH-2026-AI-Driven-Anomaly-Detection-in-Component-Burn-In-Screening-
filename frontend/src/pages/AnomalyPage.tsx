import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ComponentDetail, type ComponentSummary } from '@/lib/api'
import { fmt } from '@/lib/utils'
import { toast } from 'sonner'

const layers = [
  {
    title: 'Layer 1 — Specification check',
    body: 'Compare latest readings against configured datasheet limits. Remaining under the limit is not sufficient by itself.',
  },
  {
    title: 'Layer 2 — Lot-relative analysis',
    body: 'Median, mean, standard deviation, robust MAD deviation, and percent deviation versus the same batch.',
  },
  {
    title: 'Layer 3 — Trend analysis',
    body: 'Absolute drift, percentage drift, slope, rate of change, and late-interval acceleration.',
  },
  {
    title: 'Layer 4 — Machine learning',
    body: 'Isolation Forest on multivariate features (raw values, robust z-scores, slopes, temperature–leakage coupling).',
  },
]

export function AnomalyPage() {
  const [items, setItems] = useState<ComponentSummary[]>([])
  const [id, setId] = useState('')
  const [detail, setDetail] = useState<ComponentDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    endpoints
      .components()
      .then((r) => {
        const ranked = [...r.items].sort((a, b) => b.risk_score - a.risk_score)
        setItems(ranked)
        setId(ranked[0]?.component_id ?? '')
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!id) return
    endpoints
      .component(id)
      .then(setDetail)
      .catch((e: Error) => setErr(e.message))
  }, [id])

  async function rerun() {
    setBusy(true)
    try {
      const r = await endpoints.analyze()
      toast.success(`Re-analyzed ${String(r.analyzed ?? '')} components with Isolation Forest + RF.`)
      const list = await endpoints.components()
      setItems([...list.items].sort((a, b) => b.risk_score - a.risk_score))
      if (id) setDetail(await endpoints.component(id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analyze failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <ErrorNote message={err} />
  if (!ready) return <Loading />
  if (!items.length) return <p className="text-muted text-sm">No analyzed components. Upload a dataset to begin screening.</p>

  const L = detail?.layers

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl text-snow font-medium">Anomaly detection</h1>
          <p className="text-sm text-muted mt-1">Four-layer engine. Thresholds 0–30 SAFE, 31–60 WARNING, 61–80 ANOMALY, 81–100 REJECT — configurable in Settings.</p>
        </div>
        <Button onClick={rerun} disabled={busy}>
          {busy ? 'Fitting models…' : 'Re-run analysis'}
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {layers.map((l) => (
          <Card key={l.title}>
            <CardBody>
              <h2 className="text-sm text-snow">{l.title}</h2>
              <p className="text-sm text-fog mt-2">{l.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Inspect a unit</CardTitle>
          <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-snow max-w-xs">
            {items.map((c) => (
              <option key={c.component_id} value={c.component_id}>
                {c.component_id} · {c.status} · risk {fmt(c.risk_score, 0)}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          {!L ? (
            <p className="text-muted text-sm">No scores yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Link to={`/components/${id}`} className="font-mono text-cyan-300 hover:underline">
                  {id}
                </Link>
                <StatusBadge status={L.status} />
                <span className="text-snow">Final risk {fmt(L.final_risk, 0)}/100</span>
              </div>
              <ScoreBar label="Specification" value={L.specification} />
              <ScoreBar label="Lot deviation" value={L.lot_relative} />
              <ScoreBar label="Trend" value={L.trend} />
              <ScoreBar label="ML anomaly (Isolation Forest)" value={L.ml_anomaly} />
              <ScoreBar label="Prediction risk" value={L.prediction} />
              <ScoreBar label="Final risk" value={L.final_risk} accent />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function ScoreBar({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="tabular text-snow">{fmt(value, 0)}/100</span>
      </div>
      <div className="h-2 rounded-full bg-line overflow-hidden">
        <div className={accent ? 'h-full bg-cyan-300' : 'h-full bg-cyan-400/70'} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}
