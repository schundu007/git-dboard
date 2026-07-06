interface GitPulseLogoProps {
  size?: number
  className?: string
  /** Show icon + wordmark text */
  withText?: boolean
  /** Text size for wordmark */
  textSize?: string
}

export default function GitPulseLogo({
  size = 20,
  className = '',
  withText = false,
  textSize = 'text-[13px]',
}: GitPulseLogoProps) {
  const icon = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={withText ? '' : className}
      aria-hidden="true"
    >
      {/* Branch tip left */}
      <circle cx="8" cy="7" r="3" fill="currentColor" />
      {/* Branch tip right */}
      <circle cx="24" cy="7" r="3" fill="currentColor" />
      {/* Merge commit node */}
      <circle cx="16" cy="17" r="3.5" fill="currentColor" />
      {/* Branch lines converging */}
      <path d="M8 10 L14 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 10 L18 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Pulse wave */}
      <path
        d="M2 26 L6 26 L9 22 L12 29 L15 24 L18 26 L30 26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  if (!withText) return icon

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-brand">{icon}</span>
      <span className={`font-bold tracking-tight text-white ${textSize}`}>
        Git<span className="text-brand">Pulse</span>
      </span>
    </span>
  )
}
