import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
const pipeline = ['Data intake', 'Validation', 'AI analysis', 'Anomaly detection', 'Engineering report']

export function LandingPage() {
  const nav = useNavigate()

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="brand-inline">
          <ShieldCheck className="brand-mark" />
          <span className="brand-name">AEGIS</span>
          <span className="brand-subtitle">SIH 26170</span>
        </div>
        <nav className="landing-nav">
          <Link to="/dashboard" className="text-link">Overview</Link>
          <Link to="/upload" className="text-link">Upload</Link>
          <Link to="/reports" className="text-link">Reports</Link>
        </nav>
      </header>

      <main className="landing-content">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">AI-DRIVEN ANOMALY DETECTION</p>
            <h1>Mission-ready detection for aerospace reliability.</h1>
            <p className="lede">
              AEGIS analyzes uploaded telemetry and component test data to identify abnormal behavior, risk drift, and
              reliability issues across aerospace systems and test environments.
            </p>

            <div className="cta-row">
              <Button onClick={() => nav('/upload')}>Upload dataset</Button>
              <Button variant="outline" onClick={() => nav('/dashboard')}>Open analysis</Button>
            </div>

            <div className="meta-row">
              <span>CSV / XLSX / JSON</span>
              <span>Operational telemetry validation</span>
            </div>
          </div>

          <div className="hero-rail">
            <div className="mini-card">
              <span className="mini-label">System status</span>
              <strong>Standby</strong>
            </div>
            <div className="mini-card">
              <span className="mini-label">Dataset state</span>
              <strong>No file loaded</strong>
            </div>
            <div className="mini-card">
              <span className="mini-label">Analysis scope</span>
              <strong>Telemetry + burn-in</strong>
            </div>
          </div>
        </section>

        <section className="pipeline-wrap">
          <p className="section-kicker">Analysis workflow</p>
          <div className="pipeline-grid">
            {pipeline.map((step, index) => (
              <div key={step} className="pipeline-item">
                <span className="pipeline-step">0{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="focus-grid">
          <div className="focus-card">
            <p className="section-kicker">Engineering context</p>
            <p>
              Operational reliability depends on identifying subtle drift, batch divergence, and abnormal parameter movement
              before they affect mission readiness. AEGIS brings specification checks, model scoring, and trend analysis
              into one review workflow.
            </p>
          </div>

          <div className="focus-card compact">
            <div className="focus-header">
              <SlidersHorizontal size={18} />
              <span>Processing stages</span>
            </div>
            <ul>
              <li>Dataset validation and quality checks</li>
              <li>Feature extraction and anomaly scoring</li>
              <li>Trend and lot-relative deviation review</li>
              <li>Engineering summary and report generation</li>
            </ul>
            <Link to="/upload" className="inline-link">
              Begin with uploaded telemetry <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
