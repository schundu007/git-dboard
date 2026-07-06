import { type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
  badge?: string | number
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  className?: string
  size?: 'sm' | 'md'
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
  size = 'md',
}: TabBarProps<T>) {
  const isActive = (id: T) => active === id

  return (
    <div
      className={cn(
        // Flat, solid container. No gradient / inset-highlight chrome — the rest
        // of the system is flat and sharp; this was the lone gradient surface.
        'flex items-center gap-1 p-1 rounded-xl border bg-surface-2 border-border/60',
        className,
      )}
    >
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'relative flex items-center gap-2 font-medium transition-all duration-150 rounded-lg',
            size === 'md' ? 'px-3.5 py-2 text-[12px]' : 'px-3 py-1.5 text-[11px]',
            isActive(id)
              ? [
                  // Active state = raised solid surface + border + brand icon.
                  // No green glow shadow (decorative-glow ban).
                  'bg-surface-3 text-neutral-50 border border-border/80',
                ]
              : [
                  'text-neutral-500 border border-transparent',
                  'hover:text-neutral-200 hover:bg-surface-3/30',
                ],
          )}
        >
          {Icon && (
            <Icon
              size={size === 'md' ? 12 : 11}
              className={cn(
                'flex-shrink-0 transition-colors',
                isActive(id) ? 'text-brand' : 'text-neutral-600',
              )}
            />
          )}
          <span>{label}</span>
          {badge !== undefined && (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold',
                isActive(id)
                  ? 'bg-brand/20 text-brand'
                  : 'bg-surface-3 text-neutral-500',
              )}
            >
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
