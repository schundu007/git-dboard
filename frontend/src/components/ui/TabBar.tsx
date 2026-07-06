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
        'flex items-center gap-1 p-1 rounded-xl border',
        'bg-gradient-to-br from-surface-2 to-surface-2/60',
        'border-border/60',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.25)]',
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
                  'bg-surface-3 text-white',
                  'border border-border/80',
                  'shadow-[0_2px_8px_rgba(0,0,0,0.35),0_0_0_1px_rgba(118,185,0,0.14),0_0_12px_rgba(118,185,0,0.08)]',
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
          {/* Active indicator bar */}
          {isActive(id) && (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-brand/60" />
          )}
        </button>
      ))}
    </div>
  )
}
