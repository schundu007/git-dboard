import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export interface LogLine {
  job?: string
  line: string
  timestamp?: string
}

interface Props {
  lines: LogLine[]
  autoScroll?: boolean
  maxHeight?: string
}

function level(line: string): 'ERROR' | 'WARNING' | 'INFO' {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('failed') || l.includes('fatal')) return 'ERROR'
  if (l.includes('warn')) return 'WARNING'
  return 'INFO'
}

export default function LogViewer({ lines, autoScroll = true, maxHeight = '400px' }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  return (
    <div
      className="bg-surface rounded-md border border-border overflow-y-auto font-mono text-xs"
      style={{ maxHeight }}
    >
      <div className="p-3 space-y-0">
        {lines.length === 0 && (
          <p className="text-gray-600 text-center py-6">No logs yet.</p>
        )}
        {lines.map((l, i) => {
          const lv = level(l.line)
          return (
            <div key={i} className={clsx('log-line', lv)}>
              {l.job && <span className="text-accent-blue mr-2">[{l.job}]</span>}
              {l.line}
            </div>
          )
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
