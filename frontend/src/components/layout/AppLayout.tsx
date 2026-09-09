import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  Gauge,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Shield,
  Timer,
  Upload,
  X,
} from 'lucide-react'
import { useState } from 'react'

const links = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/components', label: 'Components', icon: Cpu },
  { to: '/burn-in', label: 'Burn-In', icon: Timer },
  { to: '/anomaly', label: 'Anomalies', icon: AlertTriangle },
  { to: '/prediction', label: 'Prediction', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/upload', label: 'Data Intake', icon: Upload },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const loc = useLocation()

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
            <Shield className="brand-mark" />
            {!collapsed && (
              <div className="brand-copy">
                <div className="brand-name">AEGIS</div>
                <div className="brand-subtitle">SIH 26170</div>
              </div>
            )}
          </NavLink>
          <button
            type="button"
            className="sidebar-toggle desktop-only"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button type="button" className="sidebar-toggle mobile-only" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className="sidebar-note">
            Awaiting aerospace telemetry dataset. Upload a component test file to begin analysis.
          </div>
        )}
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="sidebar-toggle mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu size={16} />
            </button>
            <Gauge size={14} className="status-icon" />
            <div className="eyebrow hidden-sm">Mission console</div>
          </div>

          <form
            className="search-shell"
            onSubmit={(e) => {
              e.preventDefault()
              nav(`/components?q=${encodeURIComponent(q)}`)
            }}
          >
            <Search size={14} className="search-icon" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search component or batch"
              aria-label="Search components"
            />
          </form>
        </header>

        <main key={loc.pathname} className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
