import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, FileText, RefreshCw, Copy, Check, Code2, EyeOff, Eye, Clock } from 'lucide-react'
import clsx from 'clsx'
import { getAIDigest } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type Digest = {
  days: number
  date_range: { start: string; end: string }
  generated_at: string
  cache_age_seconds: number
  provider: string | null
  model: string | null
  markdown: string
}

const PERIODS: { value: 1 | 7 | 14; label: string }[] = [
  { value: 1, label: 'Last 24 hours (1d)' },
  { value: 7, label: 'This week (7d)' },
  { value: 14, label: 'Last 2 weeks (14d)' },
]

function fmtCacheAge(s: number): string {
  if (s < 60) return `${s}s old`
  if (s < 3600) return `${Math.floor(s / 60)}m old`
  if (s < 86400) return `${Math.floor(s / 3600)}h old`
  return `${Math.floor(s / 86400)}d old`
}

// ── Minimal markdown renderer ────────────────────────────────────────────────
// Handles the subset the digest emits: ##/### headings, **bold**, `code`,
// bullet ("- ") and numbered ("1. ") lists, and paragraphs. Avoids pulling in a
// full markdown dependency (and an extra Vercel build step) for one page.
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      nodes.push(<strong key={`${keyBase}-b${i}`} className="font-semibold text-neutral-50">{tok.slice(2, -2)}</strong>)
    } else {
      nodes.push(<code key={`${keyBase}-c${i}`} className="px-1 py-0.5 rounded bg-surface-2 text-brand font-mono text-[11px]">{tok.slice(1, -1)}</code>)
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n')
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let k = 0

  const flushList = () => {
    if (!list) return
    const L = list
    out.push(
      L.ordered ? (
        <ol key={`l${k++}`} className="list-decimal pl-5 space-y-1.5 my-2 text-[13px] text-gray-300 leading-relaxed marker:text-gray-500">
          {L.items.map((it, i) => <li key={i}>{inline(it, `l${k}i${i}`)}</li>)}
        </ol>
      ) : (
        <ul key={`l${k++}`} className="list-disc pl-5 space-y-1.5 my-2 text-[13px] text-gray-300 leading-relaxed marker:text-gray-500">
          {L.items.map((it, i) => <li key={i}>{inline(it, `l${k}i${i}`)}</li>)}
        </ul>
      ),
    )
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet) {
      if (list && list.ordered) flushList()
      list ??= { ordered: false, items: [] }
      list.items.push(bullet[1])
      continue
    }
    if (numbered) {
      if (list && !list.ordered) flushList()
      list ??= { ordered: true, items: [] }
      list.items.push(numbered[1])
      continue
    }
    flushList()
    if (!line.trim()) continue
    if (line.startsWith('### ')) {
      out.push(<h3 key={`h${k++}`} className="text-[15px] font-semibold text-neutral-50 mt-1 mb-2">{inline(line.slice(4), `h${k}`)}</h3>)
    } else if (line.startsWith('## ')) {
      out.push(<h2 key={`h${k++}`} className="text-base font-semibold text-neutral-50 mt-3 mb-2">{inline(line.slice(3), `h${k}`)}</h2>)
    } else if (/^\s*[-–—]\s*$/.test(line)) {
      out.push(<hr key={`hr${k++}`} className="border-border/60 my-3" />)
    } else {
      out.push(<p key={`p${k++}`} className="text-[13px] text-gray-300 leading-relaxed my-2">{inline(line, `p${k}`)}</p>)
    }
  }
  flushList()
  return out
}

export default function Summary() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<1 | 7 | 14>(7)
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [hidden, setHidden] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [slug, 'ai-digest', days],
    queryFn: () => getAIDigest(days) as Promise<Digest>,
    refetchInterval: 600_000,
  })

  const forceRefresh = async () => {
    await getAIDigest(days, true)
    refetch()
  }

  const copy = () => {
    if (!data) return
    navigator.clipboard.writeText(data.markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const generatedLabel = data ? new Date(data.generated_at).toLocaleString() : '—'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand/10 ring-1 ring-brand/25 flex items-center justify-center flex-shrink-0">
            <LayoutGrid size={17} className="text-brand" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-neutral-50 leading-tight truncate">Summary</h1>
            <p className="text-[11px] text-gray-500 truncate">AI-written weekly CI health digest</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Clock size={12} />
            <span>Generated: {generatedLabel}</span>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 1 | 7 | 14)}
            className="bg-surface-2 border border-border rounded-lg text-[12px] text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/40"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={forceRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-brand/90 hover:bg-brand rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={13} className={clsx(isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
          <FileText size={14} className="text-brand" />
          <span className="text-[13px] font-semibold text-neutral-50">Weekly digest</span>
          {data && (
            <span className="text-[11px] text-gray-500 truncate">
              {data.model ? `Pre-computed by ${data.model}` : 'Heuristic'} · cache {fmtCacheAge(data.cache_age_seconds)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => setShowRaw((v) => !v)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white">
              <Code2 size={12} />{showRaw ? 'Rendered' : 'View raw'}
            </button>
            <button onClick={copy} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white">
              {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy markdown'}
            </button>
            <button onClick={() => setHidden((v) => !v)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white">
              {hidden ? <Eye size={12} /> : <EyeOff size={12} />}{hidden ? 'Show' : 'Hide'}
            </button>
          </div>
        </div>

        {!hidden && (
          <div className="px-5 py-4">
            {isLoading ? (
              <div className="py-10 text-center text-[13px] text-gray-500">Generating digest…</div>
            ) : isError ? (
              <div className="py-10 text-center text-[13px] text-accent-red">
                {(error as Error)?.message || 'Failed to generate digest.'}
              </div>
            ) : !data ? (
              <div className="py-10 text-center text-[13px] text-gray-500">No digest available.</div>
            ) : showRaw ? (
              <pre className="text-[12px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{data.markdown}</pre>
            ) : (
              <div className="max-w-3xl">{renderMarkdown(data.markdown)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
