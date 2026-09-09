import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { endpoints, type Dashboard } from '@/lib/api'
import { fmt, severityClass } from '@/lib/utils'
import { StatusBadge } from '@/components/StatusBadge'

const pieColors: Record<string, string> = {
  SAFE: '#34d399',
  WARNING: '#fbbf24',
  ANOMALY: '#fb923c',
  REJECTED: '#fb7185',
}

export function DashboardPage() {
  const nav = useNavigate()
  const [data, setData] = useState<Dashboard | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    endpoints
      .dashboard()
      .then(setData)
      .catch((e: Error) => setErr(e.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function analyze() {
    setBusy(true)
    try {
      await endpoints.analyze()
      toast.success('Isolation Forest and regressor refit.')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analyze failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <p className="text-rose-300">{err}</p>
  if (!data) return <p className="text-muted">Loading overview…</p>

  if (data.totals.tested === 0) {
    return (
      <div className="empty-analytics-shell">
        <div className="empty-analytics-panel">
          <p className="section-kicker">AEGIS ANALYSIS</p>
          <h1>No dataset loaded</h1>
          <p>Upload a telemetry or component test dataset to begin validation, AI analysis, and anomaly detection.</p>
          <Button onClick={() => nav('/upload')}>Upload dataset</Button>
        </div>
      </div>
    )
  }

  const t = data.totals
  const cards = [
    ['Total Components Tested', t.tested],
    ['Safe', t.safe],
    ['Warning', t.warning],
    ['Anomaly', t.anomaly],
    ['Rejected', t.rejected],
    ['High Risk', t.high_risk],
    ['Average Anomaly Score', t.average_anomaly_score],
    ['Predicted Failures', t.predicted_failures],
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-snow font-medium">System overview</h1>
          <p className="text-xs text-amber-200/80 mt-1">{data.data_label}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={analyze} disabled={busy}>
            Re-analyze
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="bg-[rgba(15,23,42,0.88)]">
            <CardBody>
              <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
              <div className="mt-2 text-2xl text-snow tabular">{fmt(value, label.includes('Score') ? 2 : 0)}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Components by Status</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.status_chart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80}>
                  {data.status_chart.map((e) => (
                    <Cell key={e.name} fill={pieColors[e.name] ?? '#5ec8f0'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anomaly Score Distribution</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.anomaly_histogram}>
                <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="#8fa0b8" fontSize={11} />
                <YAxis stroke="#8fa0b8" fontSize={11} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="count" fill="#5ec8f0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Burn-In Progress</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.burnin_progress}>
                <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
                <XAxis dataKey="hour" stroke="#8fa0b8" fontSize={11} />
                <YAxis stroke="#8fa0b8" fontSize={11} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="count" fill="#7dd3fc" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Parameter Drift (leakage)</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer>
              <LineChart data={data.avg_drift}>
                <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
                <XAxis dataKey="hour" stroke="#8fa0b8" fontSize={11} />
                <YAxis stroke="#8fa0b8" fontSize={11} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="avg_leakage" stroke="#5ec8f0" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Predicted vs Actual Values (leakage at 168h where available)</CardTitle>
        </CardHeader>
        <CardBody className="h-72">
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid stroke="#243049" />
              <XAxis dataKey="predicted" name="Predicted" stroke="#8fa0b8" fontSize={11} />
              <YAxis dataKey="actual" name="Actual" stroke="#8fa0b8" fontSize={11} />
              <Tooltip contentStyle={tip} cursor={{ stroke: '#5ec8f0' }} />
              <Scatter
                data={data.predicted_vs_actual.filter((d) => d.actual !== null)}
                fill="#5ec8f0"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardBody className="divide-y divide-line p-0">
          {data.alerts.length === 0 && <p className="p-4 text-muted text-sm">No alerts have been generated for the loaded dataset.</p>}
          {data.alerts.map((a) => (
            <Link
              key={a.id}
              to={`/components/${a.component_id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-white/3"
            >
              <span className="font-mono text-sm text-snow">{a.component_id}</span>
              <span className="text-sm text-fog flex-1 min-w-48">{a.reason}</span>
              <span className={`text-xs font-semibold ${severityClass(a.severity)}`}>{a.severity}</span>
              <StatusBadge status={a.severity === 'CRITICAL' ? 'REJECTED' : a.severity === 'HIGH' ? 'ANOMALY' : 'WARNING'} />
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}

const tip = { background: '#121a2b', border: '1px solid #243049', color: '#e8eef6' }
