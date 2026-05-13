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
  sm: { wrap: 'py-8 px-4', icon: 'w-10 h-10', title: 'text-sm', desc: 'text-xs' },
  md: { wrap: 'py-12 px-6', icon: 'w-12 h-12', title: 'text-base', desc: 'text-sm' },
  lg: { wrap: 'py-16 px-8', icon: 'w-16 h-16', title: 'text-lg', desc: 'text-sm' },
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const s = sizes[size]
  return (
    <div className={cn('flex flex-col items-center justify-center text-center animate-fade-in', s.wrap, className)}>
      {icon && (
        <div className={cn('flex items-center justify-center rounded-2xl bg-surface-2 border border-border text-gray-600 mb-4', s.icon)}>
          {icon}
        </div>
      )}
      <p className={cn('font-semibold text-gray-300', s.title)}>{title}</p>
      {description && (
        <p className={cn('text-gray-500 mt-1.5 max-w-sm', s.desc)}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
