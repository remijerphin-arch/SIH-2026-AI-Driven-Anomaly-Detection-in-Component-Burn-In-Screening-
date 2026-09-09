import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function statusClass(status: string) {
  switch (status) {
    case 'SAFE':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'WARNING':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'ANOMALY':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
    case 'REJECTED':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  }
}

export function severityClass(sev: string) {
  switch (sev) {
    case 'CRITICAL':
      return 'text-rose-300'
    case 'HIGH':
      return 'text-orange-300'
    case 'MEDIUM':
      return 'text-amber-300'
    default:
      return 'text-cyan-300'
  }
}
