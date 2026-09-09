import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ErrorNote, Loading } from '@/components/EmptyState'
import { endpoints, type AppSettings } from '@/lib/api'

export function SettingsPage() {
  const [cfg, setCfg] = useState<AppSettings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [limits, setLimits] = useState<Record<string, number>>({})

  useEffect(() => {
    endpoints
      .settings()
      .then((s) => {
        setCfg(s)
        setLimits({ ...(s.specification_limits ?? {}) })
      })
      .catch((e: Error) => setErr(e.message))
  }, [])

  async function save() {
    if (!cfg) return
    setBusy(true)
    try {
      const saved = await endpoints.saveSettings({
        specification_limits: limits,
        warning_threshold_pct: Number(cfg.warning_threshold_pct),
        risk_safe_max: Number(cfg.risk_safe_max),
        risk_warning_max: Number(cfg.risk_warning_max),
        risk_anomaly_max: Number(cfg.risk_anomaly_max),
        batch_method: cfg.batch_method,
        prediction_horizon: Number(cfg.prediction_horizon),
        model_selection: cfg.model_selection,
        refresh_interval_sec: Number(cfg.refresh_interval_sec),
        theme: cfg.theme,
        data_retention_days: Number(cfg.data_retention_days),
      })
      setCfg(saved)
      toast.success(`Settings saved. Fleet re-analyzed (${String(saved.reanalyzed ?? 0)} units).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (err) return <ErrorNote message={err} />
  if (!cfg) return <Loading />

  const run = cfg.latest_model_run
  const metrics = run?.metrics ?? {}

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl text-snow font-medium">Settings</h1>
          <p className="text-sm text-muted mt-1">Risk thresholds and limits are applied on save by re-running the analysis pipeline.</p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving & analyzing…' : 'Save settings'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Specification limits</CardTitle>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(limits).map(([k, v]) => (
            <label key={k} className="text-sm">
              <span className="text-xs text-muted block mb-1">{k.replaceAll('_', ' ')}</span>
              <input
                type="number"
                value={v}
                step="0.1"
                onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })}
                className="w-full rounded-md border border-line bg-panel px-3 py-2 text-snow"
              />
            </label>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk & warning thresholds</CardTitle>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Num label="Warning threshold (fraction of limit)" value={Number(cfg.warning_threshold_pct)} onChange={(v) => setCfg({ ...cfg, warning_threshold_pct: v })} step={0.01} />
          <Num label="SAFE max" value={Number(cfg.risk_safe_max)} onChange={(v) => setCfg({ ...cfg, risk_safe_max: v })} />
          <Num label="WARNING max" value={Number(cfg.risk_warning_max)} onChange={(v) => setCfg({ ...cfg, risk_warning_max: v })} />
          <Num label="ANOMALY max (above = REJECT)" value={Number(cfg.risk_anomaly_max)} onChange={(v) => setCfg({ ...cfg, risk_anomaly_max: v })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analysis & console</CardTitle>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-xs text-muted block mb-1">Batch comparison</span>
            <select
              value={String(cfg.batch_method)}
              onChange={(e) => setCfg({ ...cfg, batch_method: e.target.value })}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-snow"
            >
              <option value="robust_zscore">Robust z-score (MAD)</option>
              <option value="mean_std">Mean / std (stored; robust z remains default engine)</option>
            </select>
          </label>
          <Num label="Prediction horizon (h)" value={Number(cfg.prediction_horizon)} onChange={(v) => setCfg({ ...cfg, prediction_horizon: v })} />
          <label className="text-sm">
            <span className="text-xs text-muted block mb-1">Model selection</span>
            <select
              value={String(cfg.model_selection)}
              onChange={(e) => setCfg({ ...cfg, model_selection: e.target.value })}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-snow"
            >
              <option value="isolation_forest+random_forest">Isolation Forest + Random Forest</option>
              <option value="xgboost">XGBoost (registered, not active)</option>
              <option value="lstm">LSTM (registered, not active)</option>
              <option value="gru">GRU (registered, not active)</option>
            </select>
          </label>
          <Num label="Refresh interval (sec)" value={Number(cfg.refresh_interval_sec)} onChange={(v) => setCfg({ ...cfg, refresh_interval_sec: v })} />
          <label className="text-sm">
            <span className="text-xs text-muted block mb-1">Theme</span>
            <select
              value={String(cfg.theme)}
              onChange={(e) => setCfg({ ...cfg, theme: e.target.value })}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-snow"
            >
              <option value="mission-dark">Mission dark</option>
              <option value="mission-dim">Mission dim</option>
            </select>
          </label>
          <Num label="Data retention (days)" value={Number(cfg.data_retention_days)} onChange={(v) => setCfg({ ...cfg, data_retention_days: v })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI model information</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-fog space-y-2">
          <p>
            Active anomaly model: <strong className="text-snow">IsolationForest</strong> on robust-scaled multivariate features
            (raw values, lot-relative robust z-scores, percent change, slope, acceleration, temperature–leakage coupling).
          </p>
          <p>
            Statistical layer: <strong className="text-snow">robust z-score</strong> z = (x − median) / (1.4826 × MAD).
          </p>
          <p>
            Prediction: <strong className="text-snow">RandomForestRegressor</strong> from early checkpoints to 168h leakage.
            Architecture is modular so XGBoost / LSTM / GRU trainers can be registered later.
          </p>
          {run ? (
            <div className="rounded-md border border-line p-3 text-xs">
              <p className="text-snow">{run.model_type}</p>
              <p className="mt-1">{run.notes}</p>
              <p className="mt-2 tabular">
                n={run.sample_count}
                {metrics.mae != null && ` · MAE ${Number(metrics.mae).toFixed(3)}`}
                {metrics.rmse != null && ` · RMSE ${Number(metrics.rmse).toFixed(3)}`}
                {metrics.r2 != null && ` · R² ${Number(metrics.r2).toFixed(3)}`}
                {metrics.split != null && ` · split ${String(metrics.split)}`}
                {metrics.note != null && ` · ${String(metrics.note)}`}
              </p>
            </div>
          ) : (
            <p>No model run recorded yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <label className="text-sm">
      <span className="text-xs text-muted block mb-1">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-line bg-panel px-3 py-2 text-snow"
      />
    </label>
  )
}
