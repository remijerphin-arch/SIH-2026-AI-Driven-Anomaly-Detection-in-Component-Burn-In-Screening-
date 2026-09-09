import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ComponentDetail } from '@/lib/api'
import { PARAMETERS, chartTip, type ParamKey } from '@/lib/params'
import { fmt } from '@/lib/utils'

export function ComponentDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<ComponentDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [param, setParam] = useState<ParamKey>('leakage_current')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    endpoints
      .component(id)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
  }, [id])

  const meta = PARAMETERS.find((p) => p.key === param)!
  const chart = useMemo(() => {
    if (!data) return []
    const rows = data.measurements.map((m) => ({
      hour: m.test_hour,
      actual: (m as Record<string, unknown>)[param] as number,
      batch: m.batch_avg?.[param] ?? (param === 'leakage_current' ? m.batch_avg_leakage : undefined),
      predicted: undefined as number | undefined,
    }))
    if (data.prediction && param === 'leakage_current') {
      const last = rows[rows.length - 1]
      if (last && last.hour < 168) {
        rows.push({
          hour: 168,
          actual: undefined as unknown as number,
          batch: undefined,
          predicted: data.prediction.predicted_168h,
        })
        last.predicted = last.actual
      } else if (last) {
        last.predicted = data.prediction.predicted_168h
      }
    }
    return rows
  }, [data, param])

  async function makeReport() {
    if (!id) return
    setBusy(true)
    try {
      const r = await endpoints.createReport(id)
      toast.success('Screening report generated.')
      nav(`/reports/${r.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Report failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <ErrorNote message={err} />
  if (!data) return <Loading label="Loading component telemetry…" />

  const s = data.summary
  const limit = data.limits[param] ?? s.spec_limit
  const warn = limit * data.warning_threshold_pct

  const facts = [
    ['Component ID', s.component_id],
    ['Batch', s.batch_id],
    ['Component type', s.component_type],
    ['Manufacturer', s.manufacturer],
    ['Current test', `${s.current_test_hour} / 168 hours`],
    ['Status', s.status],
    ['Risk score', `${fmt(s.risk_score, 0)} / 100`],
    ['Anomaly score', fmt(s.anomaly_score, 2)],
    ['Predicted 168h', `${fmt(s.predicted_168h, 1)} µA`],
    ['Specification limit', `${fmt(s.spec_limit, 0)} µA`],
    ['Drift rate', s.drift_risk],
    ['Prediction confidence', `${fmt(s.confidence, 0)}%`],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            <Link to="/components" className="hover:text-cyan-300">
              Components
            </Link>{' '}
            / {s.component_id}
          </p>
          <h1 className="text-2xl text-snow font-medium mt-1 font-mono">{s.component_id}</h1>
          <p className="text-xs text-amber-200/80 mt-1">{data.data_label}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={s.status} />
          <Button onClick={makeReport} disabled={busy}>
            {busy ? 'Generating…' : 'Generate report'}
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {facts.map(([k, v]) => (
          <Card key={k}>
            <CardBody>
              <div className="text-[11px] uppercase tracking-wider text-muted">{k}</div>
              <div className="mt-1 text-snow">{v}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Burn-in time series · {meta.label}</CardTitle>
          <select
            value={param}
            onChange={(e) => setParam(e.target.value as ParamKey)}
            className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-snow"
          >
            {PARAMETERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody className="h-80">
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
              <XAxis dataKey="hour" stroke="#8fa0b8" fontSize={11} unit="h" />
              <YAxis stroke="#8fa0b8" fontSize={11} unit={` ${meta.unit}`} />
              <Tooltip contentStyle={chartTip} />
              <Legend />
              <ReferenceLine y={limit} stroke="#fb7185" strokeDasharray="4 4" label={{ value: 'Spec limit', fill: '#fb7185', fontSize: 11 }} />
              <ReferenceLine y={warn} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: 'Warning', fill: '#fbbf24', fontSize: 11 }} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#5ec8f0" strokeWidth={2} connectNulls={false} dot />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#a78bfa" strokeDasharray="6 4" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="batch" name="Batch average" stroke="#34d399" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why was this component flagged?</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {(!data.layers?.explanations || data.layers.explanations.length === 0) && (
            <p className="text-muted text-sm">No layer explanations stored. Re-run analysis from Settings or Data Upload.</p>
          )}
          <ol className="list-decimal pl-5 space-y-2 text-fog">
            {data.layers?.explanations.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ol>
          {data.layers && (
            <div className="grid sm:grid-cols-5 gap-2 pt-2">
              {(
                [
                  ['Specification', data.layers.specification],
                  ['Lot-relative', data.layers.lot_relative],
                  ['Trend', data.layers.trend],
                  ['ML anomaly', data.layers.ml_anomaly],
                  ['Prediction', data.layers.prediction],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="rounded-md border border-line px-3 py-2">
                  <div className="text-[11px] text-muted">{l}</div>
                  <div className="text-snow tabular">{fmt(v, 0)}/100</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-snow">
            Risk: <strong>{s.drift_risk}</strong> · Composite {fmt(s.risk_score, 0)}/100 · Status {s.status}
          </p>
          <p className="text-sm text-fog">Recommendation: {data.recommendation}</p>
          <p className="text-xs text-muted">
            Scores are model outputs, not certainty. Prediction confidence on this unit is {fmt(s.confidence, 0)}%.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
