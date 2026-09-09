import { useEffect, useMemo, useState } from 'react'
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
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ComponentDetail, type ComponentSummary } from '@/lib/api'
import { chartTip } from '@/lib/params'
import { fmt } from '@/lib/utils'
import { toast } from 'sonner'

export function PredictionPage() {
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
        const ranked = [...r.items].sort((a, b) => (b.predicted_168h ?? 0) - (a.predicted_168h ?? 0))
        setItems(ranked)
        setId(ranked[0]?.component_id ?? '')
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!id) return
    endpoints.component(id).then(setDetail).catch((e: Error) => setErr(e.message))
  }, [id])

  const chart = useMemo(() => {
    if (!detail) return []
    const leak = detail.measurements.map((m) => ({
      hour: m.test_hour,
      actual: m.leakage_current as number | null,
      predicted: null as number | null,
    }))
    const last = leak[leak.length - 1]
    if (last && detail.prediction) {
      last.predicted = last.actual
      if (last.hour < 168) {
        leak.push({ hour: 168, actual: null, predicted: detail.prediction.predicted_168h })
      }
    }
    return leak
  }, [detail])

  async function runPredict() {
    if (!id) return
    setBusy(true)
    try {
      const d = await endpoints.predict(id)
      setDetail(d)
      toast.success('Loaded stored Random Forest prediction for this unit.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Predict failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <ErrorNote message={err} />
  if (!ready) return <Loading />
  if (!items.length) return <p className="text-muted text-sm">No components. Run the live demo first.</p>

  const p = detail?.prediction
  const lastLeak = detail?.measurements.at(-1)?.leakage_current
  const s = detail?.summary

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-snow font-medium">Drift prediction</h1>
        <p className="text-sm text-muted mt-1">
          RandomForestRegressor trained on early checkpoints (0h / 24h / 96h) to estimate 168h leakage. Holdout MAE/RMSE/R²
          appear in Settings after a model run. Values are calculated only from uploaded data.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-snow">
          {items.map((c) => (
            <option key={c.component_id} value={c.component_id}>
              {c.component_id}
            </option>
          ))}
        </select>
        <Button onClick={runPredict} disabled={busy}>
          {busy ? 'Predicting…' : 'Run prediction'}
        </Button>
        {s && <StatusBadge status={s.status} />}
      </div>

      {p && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Current reading" value={`${fmt(lastLeak, 1)} µA`} />
          <Kpi label="Predicted 168h" value={`${fmt(p.predicted_168h, 1)} µA`} />
          <Kpi label="Prediction range" value={`${fmt(p.range_low, 1)} – ${fmt(p.range_high, 1)}`} />
          <Kpi label="Limit" value={`${fmt(s?.spec_limit, 0)} µA`} />
          <Kpi label="P(limit crossing)" value={`${fmt(p.probability_limit_cross * 100, 0)}%`} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Actual 0h → current · Predicted to 168h</CardTitle>
        </CardHeader>
        <CardBody className="h-80">
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
              <XAxis dataKey="hour" stroke="#8fa0b8" fontSize={11} />
              <YAxis stroke="#8fa0b8" fontSize={11} unit=" µA" />
              <Tooltip contentStyle={chartTip} />
              <Legend />
              {s && <ReferenceLine y={s.spec_limit} stroke="#fb7185" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#5ec8f0" strokeWidth={2} connectNulls={false} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#a78bfa" strokeDasharray="6 4" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
      {p && (
        <p className="text-sm text-fog">
          Drift rate {fmt(p.drift_rate, 4)} µA/h · Risk {s?.drift_risk}. This probability is a heuristic from the prediction
          interval versus the spec limit — not a calibrated failure probability.
        </p>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        <div className="mt-1 text-lg text-snow tabular">{value}</div>
      </CardBody>
    </Card>
  )
}
