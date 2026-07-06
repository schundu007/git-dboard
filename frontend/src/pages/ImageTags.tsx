import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, Server, Clock, ChevronDown } from 'lucide-react'
import { getTagsMatrix, getTagsLifecycle, getTagsCompute, getActiveRepo } from '../lib/api'

// ── Copyable tag pill ────────────────────────────────────────────────────────

function CopyTag({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div
      onClick={copy}
      className="group flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2 py-1 cursor-pointer hover:border-accent-blue/50 transition-colors"
    >
      <code className="text-[11px] text-gray-300 font-mono break-all">{value}</code>
      {copied
        ? <Check size={11} className="text-accent-green flex-shrink-0" />
        : <Copy size={11} className="text-gray-400 group-hover:text-gray-400 flex-shrink-0" />
      }
    </div>
  )
}

// ── Lifecycle table ──────────────────────────────────────────────────────────

function LifecycleSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['tags-lifecycle'],
    queryFn: getTagsLifecycle,
    staleTime: Infinity,
  })

  if (isLoading) return null

  const policies: any[] = data?.policies ?? []

  return (
    <div>
      <div className="section-head">Lifecycle Policy</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Pattern</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">TTL</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Age source</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Registries</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Example</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p: any) => (
              <tr key={p.pattern} className="border-t border-border/50 hover:bg-surface-2/30">
                <td className="py-2 px-3">
                  <code className="text-accent-blue font-mono text-[11px]">{p.pattern}</code>
                </td>
                <td className="py-2 px-3">
                  {p.permanent ? (
                    <span className="text-accent-green font-medium">permanent</span>
                  ) : (
                    <span className="text-gray-300">{p.ttl_days}d</span>
                  )}
                </td>
                <td className="py-2 px-3 text-gray-400">{p.age_source}</td>
                <td className="py-2 px-3">
                  {Array.isArray(p.registries)
                    ? p.registries.map((r: string) => (
                        <span key={r} className="mr-1 inline-flex items-center gap-1 text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-gray-400">{r}</span>
                      ))
                    : <span className="text-gray-500 text-[11px]">{p.registries}</span>
                  }
                </td>
                <td className="py-2 px-3">
                  <code className="text-gray-500 font-mono text-[10px]">{p.example}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── OCI labels reference ──────────────────────────────────────────────────────

function buildOciLabels(repoSlug: string) {
  const [owner = '', repo = ''] = repoSlug.split('/')
  const ns = `com.github.${owner.toLowerCase()}.${repo.toLowerCase()}`
  return [
    { key: 'org.opencontainers.image.source',   value: `https://github.com/${repoSlug}` },
    { key: 'org.opencontainers.image.revision',  value: 'full git SHA' },
    { key: 'org.opencontainers.image.created',   value: 'build timestamp' },
    { key: `${ns}.build-type`,                   value: 'nightly | release' },
  ]
}

function OciLabels({ repoSlug }: { repoSlug: string }) {
  const labels = buildOciLabels(repoSlug)
  return (
    <div>
      <div className="section-head">OCI Labels</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Label key</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {labels.map(l => (
              <tr key={l.key} className="border-t border-border/50 hover:bg-surface-2/30">
                <td className="py-2 px-3">
                  <code className="text-accent-blue font-mono text-[11px]">{l.key}</code>
                </td>
                <td className="py-2 px-3 text-gray-400">{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        All labels are validated by <code className="font-mono">verify-push.py</code> after every push.
      </p>
    </div>
  )
}

// ── Registry comparison ───────────────────────────────────────────────────────

const REGISTRY_ROWS = [
  { feature: 'Nightly tags',          ghcr: true  },
  { feature: 'SHA tags',              ghcr: true  },
  { feature: 'Release / latest tags', ghcr: true  },
  { feature: 'BuildKit cache',        ghcr: true  },
  { feature: 'Lifecycle TTL cleanup', ghcr: true  },
]

function RegistryComparison({ repoSlug }: { repoSlug: string }) {
  const owner = repoSlug.split('/')[0] ?? ''
  const repo = repoSlug.split('/')[1] ?? ''
  return (
    <div>
      <div className="section-head">Container Registry</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Feature</th>
              <th className="text-center py-2 px-3 text-gray-400 font-mono">GHCR</th>
            </tr>
          </thead>
          <tbody>
            {REGISTRY_ROWS.map(r => (
              <tr key={r.feature} className="border-t border-border/50 hover:bg-surface-2/30">
                <td className="py-2 px-3 text-gray-300">{r.feature}</td>
                <td className="py-2 px-3 text-center">{r.ghcr ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px]">
        <div className="bg-surface-2 border border-border rounded px-2 py-1.5">
          <p className="text-gray-500 mb-0.5">GHCR</p>
          <code className="text-gray-400 font-mono">ghcr.io/{owner.toLowerCase()}/{repo.toLowerCase()}</code>
          <p className="text-gray-400 mt-0.5">Auth: GITHUB_TOKEN / PAT</p>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImageTags() {
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''

  return (
    <div className="space-y-5">

        {/* Registry */}
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <RegistryComparison repoSlug={repoSlug} />
        </div>

        {/* Lifecycle + OCI labels side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <LifecycleSection />
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <OciLabels repoSlug={repoSlug} />
          </div>
        </div>

    </div>
  )
}
