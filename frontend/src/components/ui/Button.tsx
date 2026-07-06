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
  primary:   'bg-brand text-[#0f1a00] hover:bg-[#82cf00] ring-1 ring-brand/40 shadow-sm active:scale-[0.98]',
  secondary: 'bg-surface-3 text-neutral-200 hover:bg-surface-4 ring-1 ring-border hover:ring-border-strong active:scale-[0.98]',
  ghost:     'text-neutral-400 hover:text-neutral-100 hover:bg-surface-2 active:scale-[0.98]',
  danger:    'bg-red-500/[.08] text-red-400 hover:bg-red-500/[.14] ring-1 ring-red-500/25 active:scale-[0.98]',
  outline:   'ring-1 ring-border text-neutral-300 hover:ring-border-strong hover:bg-surface-2 active:scale-[0.98]',
  success:   'bg-emerald-500/[.08] text-emerald-400 hover:bg-emerald-500/[.14] ring-1 ring-emerald-500/25 active:scale-[0.98]',
}

const sizeStyles: Record<Size, string> = {
  xs: 'h-6  px-2    text-[11px] gap-1   rounded',
  sm: 'h-7  px-2.5  text-[12px] gap-1.5 rounded-md',
  md: 'h-8  px-3    text-[13px] gap-2   rounded-md',
  lg: 'h-9  px-4    text-[13px] gap-2   rounded-lg',
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading
        ? <span className="inline-block w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
        : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}
