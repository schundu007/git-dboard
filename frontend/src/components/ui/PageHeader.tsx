import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

interface PageHeaderProps {
  /** Page title. Every page must have one. */
  title: string
  /** One-line context under the title. */
  subtitle?: string
  /** Leading icon, rendered in the brand icon-badge. */
  icon?: LucideIcon
  /** Right-aligned actions / status (buttons, chips). */
  actions?: ReactNode
}

/**
 * The one page-header treatment. Icon-badge + title + optional subtitle on the
 * left, actions on the right. Matches the existing Overview/InfraGap header so
 * titled and newly-titled pages read as one product. See DESIGN.md.
 */
export function PageHeader({ title, subtitle, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-brand/10 ring-1 ring-brand/25 flex items-center justify-center flex-shrink-0">
            <Icon size={17} className="text-brand" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-neutral-50 leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
