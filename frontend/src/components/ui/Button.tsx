import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' }) {
  const styles = {
    primary: 'bg-[rgba(125,211,252,0.12)] text-snow border border-[rgba(125,211,252,0.26)] hover:bg-[rgba(125,211,252,0.18)]',
    ghost: 'bg-transparent text-slate-200 hover:bg-white/4 border border-transparent',
    outline: 'border border-[rgba(148,163,184,0.28)] bg-transparent text-snow hover:border-[rgba(125,211,252,0.34)] hover:text-sky-100',
    danger: 'bg-red-500/10 text-red-100 border border-red-500/30 hover:bg-red-500/15',
  }[variant]
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium tracking-[0.01em] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_0_1px_rgba(15,23,42,0.4)]',
        styles,
        className,
      )}
      {...props}
    />
  )
}
