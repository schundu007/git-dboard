import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success'
type Size    = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  children?: ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-accent-blue text-white hover:bg-blue-500 shadow-sm active:scale-[0.98]',
  secondary: 'bg-surface-3 text-gray-200 hover:bg-surface-4 border border-border active:scale-[0.98]',
  ghost:     'text-gray-400 hover:text-gray-200 hover:bg-surface-2 active:scale-[0.98]',
  danger:    'bg-accent-red/10 text-accent-red hover:bg-accent-red/20 border border-accent-red/30 active:scale-[0.98]',
  outline:   'border border-border text-gray-300 hover:border-border-strong hover:bg-surface-2 active:scale-[0.98]',
  success:   'bg-accent-green/10 text-accent-green hover:bg-accent-green/20 border border-accent-green/30 active:scale-[0.98]',
}

const sizeStyles: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
  lg: 'h-9 px-4 text-sm gap-2 rounded-lg',
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon,
  iconRight,
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}
