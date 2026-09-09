import { useEffect, useState, type ReactElement } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type AnalyticsPayload } from '@/lib/api'
import { PARAMETERS, chartTip } from '@/lib/params'
import { fmt } from '@/lib/utils'

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    endpoints.analytics().then(setData).catch((e: Error) => setErr(e.message))
  }, [])

  if (err) return <ErrorNote message={err} />
  if (!data) return <Loading />
  if (data.empty) return <EmptyState title="No analysis available." hint="Upload and analyze a dataset to view telemetry trends and fleet statistics." />

  const k = data.kpis ?? {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-snow font-medium">Analytics</h1>
        <p className="text-sm text-muted mt-1">Fleet-level statistics calculated from the uploaded aerospace dataset.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Best-performing batch" value={String(k.best_batch ?? '—')} />
        <Kpi label="Most anomalous parameter" value={String(k.most_anomalous_parameter ?? '—').replaceAll('_', ' ')} />
        <Kpi label="Highest-risk type" value={String(k.highest_risk_type ?? '—')} />
        <Kpi label="Average drift (µA)" value={fmt(Number(k.average_drift ?? 0), 2)} />
        <Kpi
          label="Avg prediction error"
          value={k.average_prediction_error == null ? 'n/a (need 168h)' : `${fmt(Number(k.average_prediction_error), 2)} µA`}
        />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Anomalies by batch">
          <BarChart data={data.anomalies_by_batch}>
            <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
            <XAxis dataKey="batch_id" stroke="#8fa0b8" fontSize={10} />
            <YAxis stroke="#8fa0b8" fontSize={11} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="anomalies" fill="#fb923c" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Near-limit flags by parameter">
          <BarChart data={data.anomalies_by_parameter}>
            <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
            <XAxis dataKey="parameter" stroke="#8fa0b8" fontSize={10} tickFormatter={(v) => String(v).replaceAll('_', ' ')} />
            <YAxis stroke="#8fa0b8" fontSize={11} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="near_limit_count" fill="#5ec8f0" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Risk distribution">
          <BarChart data={data.risk_distribution}>
            <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
            <XAxis dataKey="bucket" stroke="#8fa0b8" fontSize={11} />
            <YAxis stroke="#8fa0b8" fontSize={11} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="count" fill="#a78bfa" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Average risk by component type">
          <BarChart data={data.drift_by_type}>
            <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
            <XAxis dataKey="type" stroke="#8fa0b8" fontSize={10} />
            <YAxis stroke="#8fa0b8" fontSize={11} />
            <Tooltip contentStyle={chartTip} />
            <Bar dataKey="avg_risk" fill="#34d399" />
          </BarChart>
        </ChartCard>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Detection methodology</CardTitle>
        </CardHeader>
        <CardBody className="grid md:grid-cols-3 gap-4 text-sm">
          <Method title="Baseline" body="Latest readings are compared with lot-level medians and robust deviations calculated from the loaded dataset." />
          <Method title="Model" body="Isolation Forest scores multivariate feature vectors built from raw values, robust z-scores, slopes, and acceleration." />
          <Method title="Interpretation" body="Risk bands are derived from measured specification proximity, drift, model score, and projected limit proximity. They are screening indicators, not failure claims." />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Parameter correlation (latest readings)</CardTitle>
        </CardHeader>
        <CardBody>
          {!data.correlation?.length ? (
            <p className="text-muted text-sm">Need at least eight components for a stable correlation matrix.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs min-w-[640px]">
                <thead>
                  <tr>
                    <th className="p-2 text-muted text-left"> </th>
                    {PARAMETERS.map((p) => (
                      <th key={p.key} className="p-2 text-muted font-medium">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.correlation.map((row) => (
                    <tr key={String(row.parameter)}>
                      <td className="p-2 text-fog">{String(row.parameter).replaceAll('_', ' ')}</td>
                      {PARAMETERS.map((p) => {
                        const v = Number(row[p.key] ?? 0)
                        const a = Math.min(1, Math.abs(v))
                        return (
                          <td key={p.key} className="p-1 text-center tabular" style={{ background: `rgba(94,200,240,${a * 0.35})` }}>
                            {v.toFixed(2)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mt-3">
            Joint elevation of temperature, leakage current, and propagation delay is treated as a stronger warning than an
            isolated outlier in the Isolation Forest feature set.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function Method({ title, body }: { title: string; body: string }) {
  return <div className="border border-line p-3"><div className="section-kicker mb-2">{title}</div><p className="text-fog leading-6">{body}</p></div>
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        <div className="mt-1 text-snow break-all">{value}</div>
      </CardBody>
    </Card>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactElement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="h-64">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </CardBody>
    </Card>
  )
}
