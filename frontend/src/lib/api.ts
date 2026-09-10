const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'https://sih-2026-ai-driven-anomaly-detection-in.onrender.com')
const BASE = API_BASE.replace(/\/$/, '')
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string | unknown; message?: string }
    if (typeof body.detail === 'string') return body.detail
    if (typeof body.message === 'string') return body.message
    return res.statusText || 'Request failed.'
  } catch {
    return res.statusText || 'Request failed.'
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const url = `${BASE}${path}`

  try {
    const res = await fetch(url, { ...init, headers })
    if (!res.ok) {
      const message = await parseError(res)
      throw new Error(message)
    }
    return (await res.json()) as T
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' || error.message === 'NetworkError when attempting to fetch resource.') {
        throw new Error('Unable to connect to the detection service. Please check the backend status and try again.')
      }
      if (error.message === 'Bad Gateway' || error.message === 'Service Unavailable') {
        throw new Error('The detection service is unavailable. Start the backend on port 8000 and try again.')
      }
      throw error
    }
    throw new Error('Unexpected request error.')
  }
}

export const endpoints = {
  currentDataset: () => api<DatasetSummary>('/api/dataset/current'),
  health: () => api<{ ok: boolean }>('/api/health'),
  dashboard: () => api<Dashboard>('/api/dashboard'),
  components: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString()
    return api<ComponentList>(`/api/components${q ? `?${q}` : ''}`)
  },
  component: (id: string) => api<ComponentDetail>(`/api/components/${id}`),
  alerts: () => api<{ items: AlertItem[] }>('/api/alerts'),
  batches: () => api<{ items: BatchItem[] }>('/api/batches'),
  analyze: () => api<Record<string, unknown>>('/api/analyze', { method: 'POST' }),
  analytics: () => api<AnalyticsPayload>('/api/analytics'),
  burnIn: (live = false) => api<{ items: BurnInItem[]; checkpoints: number[] }>(`/api/burn-in?live=${live}`),
  settings: () => api<AppSettings>('/api/settings'),
  saveSettings: (body: Record<string, unknown>) =>
    api<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  predict: (component_id: string) =>
    api<ComponentDetail>('/api/predict', {
      method: 'POST',
      body: JSON.stringify({ component_id, parameter: 'leakage_current' }),
    }),
  uploadPreview: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api<UploadResult>('/api/upload/preview', { method: 'POST', body: fd })
  },
  upload: async (file: File) => {
    if (file.size <= UPLOAD_CHUNK_BYTES) {
      const fd = new FormData()
      fd.append('file', file)
      return api<UploadResult>('/api/upload', { method: 'POST', body: fd })
    }
    const uploadId = crypto.randomUUID()
    const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES)
    for (let index = 0; index < totalChunks; index += 1) {
      const fd = new FormData()
      fd.append('file', file.slice(index * UPLOAD_CHUNK_BYTES, (index + 1) * UPLOAD_CHUNK_BYTES))
      await api(`/api/upload/chunk?upload_id=${uploadId}&chunk_index=${index}`, { method: 'POST', body: fd })
    }
    return api<UploadResult>(`/api/upload/complete?upload_id=${uploadId}&filename=${encodeURIComponent(file.name)}&total_chunks=${totalChunks}`, { method: 'POST' })
  },
  demo: (dataset = 'FD001') => api<UploadResult>(`/api/demo?dataset=${encodeURIComponent(dataset)}`, { method: 'POST' }),
  clearDataset: () => api<{ cleared: boolean }>('/api/dataset', { method: 'DELETE' }),
  createReport: (id: string) => api<{ id: number; payload: ReportPayload }>(`/api/reports/${id}`, { method: 'POST' }),
  getReport: (id: number) => api<{ id: number; payload: ReportPayload }>(`/api/reports/${id}`),
  downloadReportUrl: (id: number) => `${BASE}/api/reports/${id}/download`,
  downloadDatasetReportUrl: () => `${BASE}/api/dataset/report/download`,
  reports: () => api<{ items: { id: number; component_id: string; created_at: string }[] }>('/api/reports'),
  export: () => api<{ items: ComponentSummary[] }>('/api/export'),
}

export type ComponentSummary = {
  component_id: string
  batch_id: string
  component_type: string
  manufacturer: string
  current_test_hour: number
  status: string
  anomaly_score: number
  risk_score: number
  drift_risk: string
  predicted_168h: number | null
  spec_limit: number
  confidence: number
  last_updated: string
  data_source: string
  category: string
}

export type AlertItem = {
  id: number
  component_id: string
  severity: string
  reason: string
  recommended_action: string
  created_at: string
}

export type BatchItem = {
  batch_id: string
  manufacturer: string
  notes: string
  component_count: number
}

export type ComponentList = {
  items: ComponentSummary[]
  types: string[]
  batches: string[]
}

export type Measurement = {
  test_hour: number
  timestamp: string
  temperature: number
  voltage: number
  current: number
  pressure: number
  vibration: number
  leakage_current: number
  propagation_delay: number
  resistance: number
  capacitance: number
  batch_avg_leakage?: number
  batch_avg?: Record<string, number>
}

export type Layers = {
  specification: number
  lot_relative: number
  trend: number
  ml_anomaly: number
  prediction: number
  final_risk: number
  status: string
  explanations: string[]
}

export type ComponentDetail = {
  summary: ComponentSummary
  measurements: Measurement[]
  layers: Layers | null
  prediction: {
    predicted_168h: number
    range_low: number
    range_high: number
    drift_rate: number
    probability_limit_cross: number
    parameter: string
  } | null
  limits: Record<string, number>
  warning_threshold_pct: number
  recommendation: string
  data_label: string
}

export type Dashboard = {
  data_label: string
  totals: {
    tested: number
    safe: number
    warning: number
    anomaly: number
    rejected: number
    high_risk: number
    average_anomaly_score: number
    predicted_failures: number
  }
  status_chart: { name: string; value: number }[]
  anomaly_histogram: { bucket: string; count: number }[]
  burnin_progress: { hour: number; count: number }[]
  avg_drift: { hour: number; avg_leakage: number }[]
  predicted_vs_actual: { component_id: string; predicted: number; actual: number | null }[]
  alerts: AlertItem[]
}

export type BurnInItem = ComponentSummary & {
  temperature: number | null
  voltage: number | null
  pressure: number | null
  vibration: number | null
  leakage_current: number | null
}

export type AnalyticsPayload = {
  empty: boolean
  generic?: boolean
  dataset?: { filename: string; schema: string }
  findings?: { identifier: string | null; time: string | number | null; parameter: string; observed: unknown; baseline: unknown; anomaly_score: number; severity: string; reason: string }[]
  kpis?: Record<string, string | number | null>
  anomalies_by_batch?: { batch_id: string; anomalies: number; total: number; rate: number; avg_drift: number }[]
  anomalies_by_parameter?: { parameter: string; near_limit_count: number }[]
  risk_distribution?: { bucket: string; count: number }[]
  drift_by_type?: { type: string; avg_risk: number }[]
  correlation?: Record<string, string | number>[]
  batch_comparison?: { batch_id: string; anomalies: number; total: number; rate: number; avg_drift: number }[]
}

export type AppSettings = Record<string, unknown> & {
  specification_limits?: Record<string, number>
  reanalyzed?: number
  latest_model_run?: {
    model_type: string
    notes: string
    metrics: Record<string, number | string>
    sample_count: number
    created_at: string
  } | null
  active_models?: Record<string, unknown>
}

export type UploadResult = {
  rows: number
  components: number
  detected_format?: string
  selected_file?: string
  warnings: string[]
  errors: string[]
  preview: Record<string, unknown>[]
  analysis: Record<string, unknown> | null
  metadata: Record<string, unknown>
  schema: {
    schema: string
    label: string
    mapping: Record<string, string>
    numeric_columns: string[]
    categorical_columns: string[]
    time_columns: string[]
    group_columns: string[]
  }
}

export type DatasetSummary = {
  loaded: boolean
  filename?: string
  format?: string
  schema?: string
  mapping?: Record<string, string>
  metadata?: Record<string, unknown>
  analysis?: Record<string, unknown>
}

export type ReportPayload = {
  title: string
  data_label: string
  generated_at: string
  disclaimer: string
  component: Record<string, unknown>
  history: Record<string, number>[]
  layers: Record<string, number> | null
  explanations: string[]
  prediction: Record<string, unknown> | null
  recommendation: string
}
