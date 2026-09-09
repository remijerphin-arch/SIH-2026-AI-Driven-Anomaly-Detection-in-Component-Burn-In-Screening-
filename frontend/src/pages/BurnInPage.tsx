import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody } from '@/components/ui/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState, ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type BurnInItem } from '@/lib/api'
import { fmt } from '@/lib/utils'

const CHECKS = [0, 24, 96, 168]

export function BurnInPage() {
  const [items, setItems] = useState<BurnInItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [live] = useState(false)

  async function load(tick: boolean) {
    try {
      const res = await endpoints.burnIn(tick)
      setItems(res.items)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load burn-in')
    }
  }

  useEffect(() => {
    void load(false)
  }, [])

  useEffect(() => {
    if (!live) return
    return undefined
  }, [live])

  if (err) return <ErrorNote message={err} />
  if (!items) return <Loading label="Loading chambers…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-snow font-medium">Burn-in monitoring</h1>
          <p className="text-sm text-muted mt-1">
            Units still below 168 hours, calculated from the uploaded dataset.
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No in-progress burn-in units." hint="Upload a dataset containing partial burn-in traces to monitor test progression." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((c) => (
            <Link key={c.component_id} to={`/components/${c.component_id}`}>
              <Card className="h-full hover:border-cyan-400/40 transition-colors">
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-snow">{c.component_id}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-fog">
                    {c.current_test_hour} / 168 hours · {c.component_type}
                  </p>
                  <Progress hour={c.current_test_hour} />
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <Stat k="Temperature" v={`${fmt(c.temperature, 1)} °C`} />
                    <Stat k="Voltage" v={`${fmt(c.voltage, 2)} V`} />
                    <Stat k="Leakage" v={`${fmt(c.leakage_current, 1)} µA`} />
                    <Stat k="Anomaly" v={fmt(c.anomaly_score, 2)} />
                    <Stat k="Drift" v={c.drift_risk} />
                    <Stat k="Batch" v={c.batch_id} />
                  </dl>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="text-snow tabular">{v}</dd>
    </div>
  )
}

function Progress({ hour }: { hour: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted mb-1">
        {CHECKS.map((h) => (
          <span key={h}>{h}h</span>
        ))}
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-cyan-400/80" style={{ width: `${Math.min(100, (hour / 168) * 100)}%` }} />
      </div>
    </div>
  )
}
