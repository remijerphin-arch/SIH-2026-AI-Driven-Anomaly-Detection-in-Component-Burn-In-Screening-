import { cn, statusClass } from '@/lib/utils'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
        statusClass(status),
      )}
    >
      {status}
    </span>
  )
}
