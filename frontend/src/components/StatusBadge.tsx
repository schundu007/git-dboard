import clsx from 'clsx'

interface Props {
  status: string | null | undefined
  size?: 'sm' | 'md'
}

function resolve(status: string | null | undefined): {
  label: string
  cls: string
  dot: string
} {
  const s = (status ?? '').toLowerCase()
  if (['success', 'completed'].includes(s))
    return { label: 'success', cls: 'text-accent-green bg-green-950', dot: 'bg-accent-green' }
  if (['failure', 'failed'].includes(s))
    return { label: 'failed', cls: 'text-accent-red bg-red-950', dot: 'bg-accent-red' }
  if (['in_progress', 'running', 'queued', 'pending'].includes(s))
    return { label: s.replace('_', ' '), cls: 'text-accent-blue bg-blue-950', dot: 'bg-accent-blue animate-pulse' }
  if (['cancelled', 'skipped', 'timed_out'].includes(s))
    return { label: s, cls: 'text-gray-400 bg-gray-800', dot: 'bg-gray-500' }
  if (s === 'action_required')
    return { label: 'action req.', cls: 'text-accent-orange bg-orange-950', dot: 'bg-accent-orange' }
  return { label: s || 'unknown', cls: 'text-gray-400 bg-gray-800', dot: 'bg-gray-500' }
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const { label, cls, dot } = resolve(status)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-mono font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
        cls
      )}
    >
      <span className={clsx('rounded-full', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', dot)} />
      {label}
    </span>
  )
}
