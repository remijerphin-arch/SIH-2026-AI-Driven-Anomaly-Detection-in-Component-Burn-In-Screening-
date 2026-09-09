export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-shell" aria-live="polite">
      <span className="loading-bar" />
      <span className="loading-text">{label}</span>
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <strong>Analysis system unavailable</strong>
      {message}
    </div>
  )
}
