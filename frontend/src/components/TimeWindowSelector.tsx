import clsx from 'clsx'

export const TIME_WINDOWS = [1, 3, 7, 14, 130] as const
export type TimeWindow = typeof TIME_WINDOWS[number]

interface Props {
  value: TimeWindow
  onChange: (w: TimeWindow) => void
  className?: string
}

export default function TimeWindowSelector({ value, onChange, className }: Props) {
  return (
    <div className={clsx('flex items-center gap-1 text-[10px]', className)}>
      {TIME_WINDOWS.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={clsx(
            'px-1.5 py-0.5 rounded transition-colors',
            value === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2',
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  )
}
