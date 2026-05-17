import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: { wrap: 'py-8 px-4',   icon: 'w-9 h-9',   title: 'text-[13px]', desc: 'text-[12px]' },
  md: { wrap: 'py-12 px-6',  icon: 'w-11 h-11',  title: 'text-[14px]', desc: 'text-[13px]' },
  lg: { wrap: 'py-16 px-8',  icon: 'w-14 h-14',  title: 'text-[15px]', desc: 'text-[13px]' },
}

export function EmptyState({ icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  const s = sizes[size]
  return (
    <div className={cn('flex flex-col items-center justify-center text-center animate-fade-in', s.wrap, className)}>
      {icon && (
        <div className={cn(
          'flex items-center justify-center rounded-xl bg-surface-2 ring-1 ring-border text-neutral-400 mb-4',
          s.icon,
        )}>
          {icon}
        </div>
      )}
      <p className={cn('font-semibold text-neutral-300', s.title)}>{title}</p>
      {description && (
        <p className={cn('text-neutral-400 mt-1.5 max-w-sm', s.desc)}>{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
