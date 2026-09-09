import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ReportPayload } from '@/lib/api'
import { chartTip } from '@/lib/params'
import { fmt } from '@/lib/utils'

export function ReportViewPage() {
  const { id } = useParams()
  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    endpoints
      .getReport(Number(id))
      .then((r) => setPayload(r.payload))
      .catch((e: Error) => setErr(e.message))
  }, [id])

  if (err) return <ErrorNote message={err} />
  if (!payload) return <Loading />

  const c = payload.component

  return (
    <div className="print-report max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between gap-3 no-print">
        <Link to="/reports" className="text-sm text-cyan-300 hover:underline">
          Back to reports
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
        {id && <a className="inline-flex items-center justify-center rounded-md border border-line bg-transparent px-3.5 py-2 text-sm font-medium text-snow hover:border-cyan-300" href={endpoints.downloadReportUrl(Number(id))} download>Download report</a>}
      </div>
      <header>
        <p className="text-xs tracking-[0.25em] text-muted">SIH 26170 · AEGIS</p>
        <h1 className="text-2xl text-snow mt-1">{payload.title}</h1>
        <p className="text-xs text-amber-200/80 mt-2">{payload.data_label}</p>
        <p className="text-xs text-muted mt-1">{payload.disclaimer}</p>
        <p className="text-xs text-muted">Generated {payload.generated_at}</p>
      </header>
      <section className="grid grid-cols-2 gap-3 text-sm">
        <Field k="Component" v={String(c.component_id)} />
        <Field k="Batch" v={String(c.batch_id)} />
        <Field k="Type" v={String(c.type)} />
        <Field k="Manufacturer" v={String(c.manufacturer)} />
        <Field k="Test hour" v={`${c.current_test_hour} / 168`} />
        <div>
          <div className="text-muted text-xs">Status</div>
          <StatusBadge status={String(c.status)} />
        </div>
        <Field k="Risk score" v={`${fmt(Number(c.risk_score), 0)}/100`} />
        <Field k="Anomaly score" v={fmt(Number(c.anomaly_score), 2)} />
        <Field k="Predicted 168h" v={`${fmt(Number(c.predicted_168h), 1)} µA`} />
        <Field k="Spec limit" v={`${fmt(Number(c.spec_limit), 0)} µA`} />
        <Field k="Model confidence" v={`${fmt(Number(c.confidence), 0)}%`} />
        <Field k="Drift risk" v={String(c.drift_risk)} />
      </section>
      <section className="h-64">
        <h2 className="text-sm text-snow mb-2">Leakage history</h2>
        <ResponsiveContainer>
          <LineChart data={payload.history}>
            <CartesianGrid stroke="var(--report-grid)" />
            <XAxis dataKey="test_hour" stroke="var(--text-muted)" fontSize={11} />
            <YAxis stroke="var(--text-muted)" fontSize={11} />
            <Tooltip contentStyle={chartTip} />
            <Line type="monotone" dataKey="leakage_current" stroke="#5ec8f0" />
          </LineChart>
        </ResponsiveContainer>
      </section>
      {payload.layers && (
        <section className="text-sm">
          <h2 className="text-snow mb-2">Layer scores</h2>
          <ul className="grid grid-cols-2 gap-2 text-fog">
            {Object.entries(payload.layers).map(([k, v]) => (
              <li key={k}>
                {k}: {fmt(v, 1)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="text-snow text-sm mb-2">Explanation</h2>
        <ol className="list-decimal pl-5 text-sm text-fog space-y-1">
          {payload.explanations.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
      </section>
      {payload.prediction && (
        <section className="text-sm text-fog">
          Predicted 168h {fmt(Number(payload.prediction.predicted_168h), 1)} µA · P(cross){' '}
          {fmt(Number(payload.prediction.probability_limit_cross) * 100, 0)}%
        </section>
      )}
      <section>
        <h2 className="text-snow text-sm">Recommendation</h2>
        <p className="text-fog mt-1">{payload.recommendation}</p>
      </section>
    </div>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-muted text-xs">{k}</div>
      <div className="text-snow">{v}</div>
    </div>
  )
}
