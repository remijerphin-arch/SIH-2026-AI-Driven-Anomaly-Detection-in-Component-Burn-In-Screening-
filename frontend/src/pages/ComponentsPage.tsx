import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardBody } from '@/components/ui/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState, ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type ComponentList } from '@/lib/api'
import { fmt } from '@/lib/utils'

export function ComponentsPage() {
  const [sp, setSp] = useSearchParams()
  const [data, setData] = useState<ComponentList | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const q = sp.get('q') ?? ''
  const status = sp.get('status') ?? ''
  const batch = sp.get('batch') ?? ''
  const type = sp.get('type') ?? ''
  const risk = sp.get('risk') ?? ''
  const progress = sp.get('progress') ?? ''

  function set(key: string, value: string) {
    const next = new URLSearchParams(sp)
    if (value) next.set(key, value)
    else next.delete(key)
    setSp(next)
  }

  useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (status) params.status = status
    if (batch) params.batch = batch
    if (type) params.component_type = type
    if (risk) params.risk = risk
    if (progress) params.progress = progress
    endpoints
      .components(params)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
  }, [q, status, batch, type, risk, progress])

  const counts = useMemo(() => {
    const c = { SAFE: 0, WARNING: 0, ANOMALY: 0, REJECTED: 0 }
    data?.items.forEach((i) => {
      if (i.status in c) c[i.status as keyof typeof c] += 1
    })
    return c
  }, [data])

  if (err) return <ErrorNote message={err} />
  if (!data) return <Loading label="Loading component inventory…" />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl text-snow font-medium">Component inventory</h1>
        <p className="text-sm text-muted mt-1">
          {data.items.length} units · {counts.SAFE} safe · {counts.WARNING} warning · {counts.ANOMALY} anomaly ·{' '}
          {counts.REJECTED} rejected
        </p>
      </div>
      <Card>
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            value={q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Search ID or batch"
            className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-snow"
          />
          <select value={status} onChange={(e) => set('status', e.target.value)} className={sel}>
            <option value="">All statuses</option>
            {['SAFE', 'WARNING', 'ANOMALY', 'REJECTED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={batch} onChange={(e) => set('batch', e.target.value)} className={sel}>
            <option value="">All batches</option>
            {data.batches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select value={type} onChange={(e) => set('type', e.target.value)} className={sel}>
            <option value="">All types</option>
            {data.types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select value={risk} onChange={(e) => set('risk', e.target.value)} className={sel}>
            <option value="">All drift risk</option>
            {['LOW', 'MEDIUM', 'HIGH'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={progress} onChange={(e) => set('progress', e.target.value)} className={sel}>
            <option value="">All progress</option>
            <option value="in_progress">In progress</option>
            <option value="complete">Complete (168h)</option>
          </select>
        </CardBody>
      </Card>
      {data.items.length === 0 ? (
        <EmptyState title="No components match these filters." hint="Upload an engineering dataset or adjust the active filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-panel text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {[
                  'Component ID',
                  'Batch ID',
                  'Type',
                  'Test hour',
                  'Status',
                  'Anomaly',
                  'Drift risk',
                  'Predicted 168h',
                  'Spec limit',
                  'Confidence',
                  'Updated',
                ].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.component_id} className="border-t border-line hover:bg-white/4">
                  <td className="px-3 py-2 font-mono">
                    <Link to={`/components/${c.component_id}`} className="text-cyan-300 hover:underline">
                      {c.component_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.batch_id}</td>
                  <td className="px-3 py-2">{c.component_type}</td>
                  <td className="px-3 py-2 tabular">{c.current_test_hour} / 168</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 tabular">{fmt(c.anomaly_score, 2)}</td>
                  <td className="px-3 py-2">{c.drift_risk}</td>
                  <td className="px-3 py-2 tabular">{fmt(c.predicted_168h, 1)} µA</td>
                  <td className="px-3 py-2 tabular">{fmt(c.spec_limit, 0)} µA</td>
                  <td className="px-3 py-2 tabular">{fmt(c.confidence, 0)}%</td>
                  <td className="px-3 py-2 text-muted">{c.last_updated.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const sel = 'rounded-md border border-line bg-panel px-3 py-2 text-sm text-snow'
