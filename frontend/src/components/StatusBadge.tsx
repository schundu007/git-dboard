import clsx from 'clsx'

interface Props {
  status: string | null | undefined
  size?: 'sm' | 'md'
}

type Resolved = { label: string; text: string; bg: string; dot: string; ring: string }

function resolve(status: string | null | undefined): Resolved {
  const s = (status ?? '').toLowerCase()

  if (['success', 'completed'].includes(s))
    return { label: 'success', text: 'text-emerald-400', bg: 'bg-emerald-500/[.07]', dot: 'bg-emerald-400', ring: 'ring-emerald-500/25' }

  if (['failure', 'failed'].includes(s))
    return { label: 'failed', text: 'text-red-400', bg: 'bg-red-500/[.07]', dot: 'bg-red-400', ring: 'ring-red-500/25' }

  if (s === 'in_progress' || s === 'running')
    return { label: s === 'running' ? 'running' : 'in progress', text: 'text-nvidia', bg: 'bg-[#76b900]/[.07]', dot: 'bg-nvidia animate-pulse', ring: 'ring-[#76b900]/25' }

  if (s === 'queued' || s === 'pending')
    return { label: s, text: 'text-neutral-400', bg: 'bg-neutral-500/[.07]', dot: 'bg-neutral-400 animate-pulse', ring: 'ring-neutral-500/25' }

  if (s === 'cancelled')
    return { label: 'cancelled', text: 'text-neutral-400', bg: 'bg-neutral-500/[.07]', dot: 'bg-neutral-500', ring: 'ring-neutral-600/25' }

  if (s === 'skipped')
    return { label: 'skipped', text: 'text-neutral-500', bg: 'bg-neutral-500/[.05]', dot: 'bg-neutral-600', ring: 'ring-neutral-700/25' }

  if (s === 'timed_out')
    return { label: 'timed out', text: 'text-red-400', bg: 'bg-red-500/[.07]', dot: 'bg-red-400', ring: 'ring-red-500/25' }

  if (s === 'action_required')
    return { label: 'action req.', text: 'text-neutral-400', bg: 'bg-neutral-500/[.07]', dot: 'bg-neutral-400', ring: 'ring-neutral-500/25' }

  return { label: s || 'unknown', text: 'text-neutral-500', bg: 'bg-neutral-500/[.05]', dot: 'bg-neutral-600', ring: 'ring-neutral-700/20' }
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const r = resolve(status)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-mono font-medium ring-1',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        r.text, r.bg, r.ring,
      )}
    >
      <span className={clsx('rounded-full flex-shrink-0', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', r.dot)} />
      {r.label}
    </span>
  )
}
