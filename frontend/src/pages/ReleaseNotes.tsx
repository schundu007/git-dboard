import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  FileText, GitCompare, Copy, Check, ExternalLink, Loader2, ListOrdered,
} from 'lucide-react'
import clsx from 'clsx'
import { getReleaseNotes } from '../lib/api'

// ── Category → accent colour ─────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  Breaking:      'text-accent-red',
  Features:      'text-accent-green',
  Fixes:         'text-accent-blue',
  Documentation: 'text-accent-purple',
  'CI/Build':    'text-accent-yellow',
  Dependencies:  'text-accent-orange',
  Refactor:      'text-accent-teal',
  Internal:      'text-gray-400',
  Other:         'text-gray-400',
}

// The 5 ordered categorization rules — mirrors the backend rule chain.
const RULES = [
  { n: 1, label: 'GitHub label match', ex: [['bug', 'Fixes'], ['feature', 'Features'], ['breaking', 'Breaking']] },
  { n: 2, label: 'Conventional prefix', ex: [['feat:', 'Features'], ['fix:', 'Fixes'], ['chore:', 'Internal']] },
  { n: 3, label: 'Bracket prefix',      ex: [['[CI]', 'CI/Build'], ['[docs]', 'Documentation'], ['[bump]', 'Dependencies']] },
  { n: 4, label: 'Verb-start heuristic', ex: [['Add …', 'Features'], ['Fix …', 'Fixes'], ['Refactor …', 'Refactor']] },
  { n: 5, label: 'Fallback',            ex: [['(no match)', 'Other']] },
]

type PR = { number: number; title: string; url: string; author: string; labels: string[] }
type Cat = { name: string; prs: PR[] }
type Result = { base: string; head: string; compare_url: string; total_commits: number; pr_count: number; categories: Cat[] }

function toMarkdown(r: Result): string {
  const lines = [`## Release notes — \`${r.base.slice(0, 7)}…${r.head.slice(0, 7)}\``, '']
  for (const c of r.categories) {
    lines.push(`### ${c.name}`)
    for (const p of c.prs) lines.push(`- ${p.title} (#${p.number}) — @${p.author}`)
    lines.push('')
  }
  return lines.join('\n')
}

export default function ReleaseNotes() {
  const [base, setBase] = useState('')
  const [head, setHead] = useState('')
  const [copied, setCopied] = useState(false)

  const gen = useMutation({
    mutationFn: () => getReleaseNotes(base.trim(), head.trim()),
  })
  const result = gen.data as Result | undefined

  const copyMarkdown = () => {
    if (!result) return
    navigator.clipboard.writeText(toMarkdown(result)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const canGenerate = base.trim().length >= 7 && head.trim().length >= 7 && !gen.isPending

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-nvidia" />
          <h1 className="text-lg font-semibold text-white">Release Notes</h1>
        </div>
        {result && (
          <span className="text-[11px] text-gray-500">
            {result.pr_count} PRs · {result.total_commits} commits
          </span>
        )}
      </div>

      {/* Generator card */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <GitCompare size={14} className="text-nvidia" />
          <span className="text-sm font-medium text-gray-200">Generate notes between two commits</span>
        </div>
        <p className="text-[11px] text-gray-500">
          Paste two commit SHAs (7+ hex chars). Every PR merged in that range on the active repo is
          fetched and categorized. Copy SHAs from the CI Pipeline tab.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">From SHA (older)</span>
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="e.g. abc1234 or full SHA"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder-gray-600 focus:outline-none focus:border-nvidia/50"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">To SHA (newer)</span>
            <input
              value={head}
              onChange={(e) => setHead(e.target.value)}
              placeholder="e.g. def5678 or full SHA"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder-gray-600 focus:outline-none focus:border-nvidia/50"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => gen.mutate()}
            disabled={!canGenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nvidia text-black hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {gen.isPending ? <Loader2 size={12} className="animate-spin" /> : <GitCompare size={12} />}
            {gen.isPending ? 'Generating…' : 'Generate'}
          </button>
          {result && (
            <>
              <button
                onClick={copyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 hover:bg-surface-3 transition-colors"
              >
                {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy markdown'}
              </button>
              {result.compare_url && (
                <a
                  href={result.compare_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-nvidia transition-colors"
                >
                  <ExternalLink size={12} /> Compare on GitHub
                </a>
              )}
            </>
          )}
        </div>

        {gen.isError && (
          <p className="text-[11px] text-accent-red">{(gen.error as Error).message}</p>
        )}
      </div>

      {/* Output */}
      {result && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-4">
          {result.categories.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No merged PRs found in this range.</p>
          ) : (
            result.categories.map((c) => (
              <div key={c.name}>
                <div className="flex items-center gap-2 pb-1.5 mb-2 border-b border-border/50">
                  <span className={clsx('text-[11px] font-bold uppercase tracking-wider', CAT_COLOR[c.name] ?? 'text-gray-400')}>
                    {c.name}
                  </span>
                  <span className="text-[10px] text-gray-600">{c.prs.length}</span>
                </div>
                <ul className="space-y-1">
                  {c.prs.map((p) => (
                    <li key={p.number} className="flex items-baseline gap-2 text-[12px]">
                      <a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-gray-500 hover:text-nvidia flex-shrink-0">
                        #{p.number}
                      </a>
                      <span className="text-gray-200">{p.title}</span>
                      {p.author && <span className="text-[10px] text-gray-600 flex-shrink-0">@{p.author}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {/* Categorization rules */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <ListOrdered size={14} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-200">How PRs are categorized</span>
          <span className="text-[10px] text-gray-600">rules apply in order — first match wins</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {RULES.map((r) => (
            <div key={r.n} className="bg-surface-2 border border-border rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-mono text-nvidia">{r.n}</span>
                <span className="text-[11px] font-medium text-gray-300">{r.label}</span>
              </div>
              <div className="space-y-1">
                {r.ex.map(([from, to]) => (
                  <div key={from} className="flex items-center gap-1 text-[10px]">
                    <code className="text-gray-400">{from}</code>
                    <span className="text-gray-600">→</span>
                    <span className={clsx('font-medium', CAT_COLOR[to] ?? 'text-gray-400')}>{to}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
