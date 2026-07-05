import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Layers, RefreshCw, Copy, Trash2, CheckCircle, Search,
  ArrowUpDown, Package, AlertTriangle, Check, ChevronDown,
  Tag, GitBranch as GitBranchIcon, Database,
} from 'lucide-react'
import { getECRImages, getECRUri, deleteECRImage, getRegistryPushStatus, getTagsMatrix, getTagsLifecycle, getTagsCompute, getActiveRepo } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'
import { formatDistanceToNow } from 'date-fns'
import type { ECRImage } from '../lib/types'
import clsx from 'clsx'
import { TabBar } from '../components/ui/TabBar'

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={clsx(
        'p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-white transition-colors flex-shrink-0',
        className,
      )}
      title="Copy"
    >
      {copied ? <CheckCircle size={11} className="text-accent-green" /> : <Copy size={11} />}
    </button>
  )
}

// ── Image row ─────────────────────────────────────────────────────────────────

function ImageRow({
  image, onDelete, ecrUri,
}: { image: ECRImage; onDelete: (tag: string) => void; ecrUri: string }) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const primaryTag = image.tags[0] ?? image.digest.slice(7, 19)
  const pullCmd = `docker pull ${image.registry}/${image.repository}:${primaryTag}`

  const sizeLabel = image.size_mb >= 1000
    ? `${(image.size_mb / 1024).toFixed(1)} GB`
    : `${image.size_mb} MB`

  const sizeClass = image.size_mb >= 5000
    ? 'text-red-400'
    : image.size_mb >= 2000
    ? 'text-yellow-400'
    : 'text-gray-400'

  const isLatest = image.tags.includes('latest')
  const isMain = image.tags.some((t) => t.startsWith('main') || t === 'main')

  return (
    <>
      <tr
        className="border-b border-border/40 hover:bg-surface-1/60 cursor-pointer text-xs transition-colors group"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Tags */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {image.tags.length === 0 && (
              <span className="text-gray-400 font-mono text-[10px]">(untagged)</span>
            )}
            {image.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className={clsx(
                  'px-1.5 py-0.5 rounded font-mono text-[10px]',
                  t === 'latest'
                    ? 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25'
                    : t.startsWith('main') || t.match(/^v\d/)
                    ? 'bg-blue-500/[.07] text-blue-400 ring-1 ring-blue-500/25'
                    : 'bg-surface-2 text-gray-300',
                )}
              >
                {t}
              </span>
            ))}
            {image.tags.length > 4 && (
              <span className="text-gray-500 text-[10px] self-center">+{image.tags.length - 4}</span>
            )}
          </div>
        </td>

        {/* Digest */}
        <td className="px-4 py-3 text-gray-500 font-mono text-[10px]">
          {image.digest.slice(7, 19)}…
        </td>

        {/* Age */}
        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
          {formatDistanceToNow(new Date(image.pushed_at), { addSuffix: true })}
        </td>

        {/* Size */}
        <td className={clsx('px-4 py-3 whitespace-nowrap tabular-nums', sizeClass)}>
          {sizeLabel}
        </td>

        {/* Badges */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {isLatest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25">latest</span>
            )}
            {isMain && !isLatest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/[.07] text-blue-400 ring-1 ring-blue-500/25">main</span>
            )}
          </div>
        </td>

        {/* Actions */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <CopyButton text={pullCmd} />
            {image.tags[0] && (
              confirming ? (
                <button
                  onClick={() => { onDelete(image.tags[0]); setConfirming(false) }}
                  onBlur={() => setConfirming(false)}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25 hover:bg-accent-red/10 transition-colors whitespace-nowrap"
                >
                  Delete?
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-red-400 transition-colors"
                  title="Delete tag"
                >
                  <Trash2 size={11} />
                </button>
              )
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/40 bg-surface-2/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-2.5 text-xs">
              {/* Pull command */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 flex-shrink-0">Pull:</span>
                <code className="font-mono text-gray-200 bg-surface-2 px-2 py-1 rounded text-[10px] flex-1 min-w-0 break-all">
                  {pullCmd}
                </code>
                <CopyButton text={pullCmd} />
              </div>

              {/* Full digest */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 flex-shrink-0">Digest:</span>
                <code className="font-mono text-gray-400 text-[10px] break-all">{image.digest}</code>
                <CopyButton text={image.digest} />
              </div>

              {/* All tags */}
              {image.tags.length > 1 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 flex-shrink-0">All tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {image.tags.map((t) => (
                      <span key={t} className="font-mono text-gray-300 bg-surface-2 px-1.5 py-0.5 rounded text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pushed at */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Pushed:</span>
                <span className="text-gray-400">{new Date(image.pushed_at).toLocaleString()}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

type SortKey = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc'
type RegistryTab = 'images' | 'tags' | 'lifecycle'

// ── Copy tag pill ─────────────────────────────────────────────────────────────

function CopyTag({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
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

// ── Build matrix grid ─────────────────────────────────────────────────────────

function MatrixSection() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'tags-matrix'],
    queryFn: getTagsMatrix,
    staleTime: Infinity,
  })

  if (isLoading) return <div className="h-40 flex items-center justify-center text-gray-500 text-sm">Loading matrix…</div>

  const simVersions: string[] = data?.sim_versions ?? []
  const imageExts: string[]   = data?.image_exts   ?? []
  const cells: any[]          = data?.cells         ?? []
  const cellFor = (sim: string, ext: string) => cells.find(c => c.sim_version === sim && c.image_ext === ext)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white">Build Status Matrix</h2>
        <span className="text-[11px] text-gray-500 font-mono">{data?.total_valid ?? 0} valid · {data?.total_skipped ?? 0} skipped</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-gray-500 font-medium w-28">Extension</th>
              {simVersions.map(v => (
                <th key={v} className="text-center py-2 px-3 text-gray-400 font-mono font-medium">Sim {v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {imageExts.map(ext => (
              <tr key={ext} className="border-t border-border/50">
                <td className="py-2.5 px-3"><code className="text-accent-blue font-mono">{ext}</code></td>
                {simVersions.map(sim => {
                  const cell = cellFor(sim, ext)
                  return (
                    <td key={sim} className="py-2.5 px-3 text-center">
                      {cell?.supported
                        ? <span className="inline-block text-accent-green" title={cell?.cell_slug}>✅</span>
                        : <span className="inline-block text-gray-400 cursor-help" title={cell?.unsupported_reason ?? 'Not supported'}>❌</span>
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">❌ = ngc-slim pre-built container not yet published by NVIDIA for this Isaac Sim version</p>
    </div>
  )
}

// ── Tag calculator ────────────────────────────────────────────────────────────

function TagCalculator() {
  const slug = useRepoSlug()
  const { data: matrixData } = useQuery({ queryKey: [slug, 'tags-matrix'], queryFn: getTagsMatrix, staleTime: Infinity })
  const simVersions: string[] = matrixData?.sim_versions ?? ['4.5.0', '5.0.0', '5.1.0']
  const imageExts: string[]   = matrixData?.image_exts   ?? ['base', 'ros2', 'cloudxr', 'ngc-slim']

  const [mode, setMode]             = useState<'nightly' | 'release'>('nightly')
  const [simVersion, setSimVersion] = useState('')
  const [imageExt, setImageExt]     = useState('')
  const [shortSha, setShortSha]     = useState('abc1234')
  const [buildDate, setBuildDate]   = useState('')
  const [releaseVer, setReleaseVer] = useState('2.3.2')

  const effectiveSimVersion = simVersion || simVersions[0] || '4.5.0'
  const effectiveImageExt   = imageExt   || imageExts[0]   || 'base'

  const params = {
    mode, sim_version: effectiveSimVersion, image_ext: effectiveImageExt, short_sha: shortSha,
    ...(mode === 'nightly' && buildDate  ? { build_date:      buildDate  } : {}),
    ...(mode === 'release' && releaseVer ? { release_version: releaseVer } : {}),
  }

  const { data, isFetching } = useQuery({
    queryKey: [slug, 'tags-compute', params],
    queryFn: () => getTagsCompute(params),
    staleTime: 5_000,
  })

  const sel = 'bg-surface-2 border border-border rounded px-2 py-1.5 text-[12px] text-gray-200 focus:outline-none focus:border-accent-blue/50'
  const inp = 'bg-surface-2 border border-border rounded px-2 py-1.5 text-[12px] text-gray-200 font-mono focus:outline-none focus:border-accent-blue/50 w-full'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Mode</label>
          <div className="flex rounded overflow-hidden border border-border">
            {(['nightly', 'release'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${mode === m ? 'bg-accent-blue text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Sim Version</label>
          <div className="relative">
            <select value={effectiveSimVersion} onChange={e => setSimVersion(e.target.value)} className={`${sel} w-full appearance-none pr-6`}>
              {simVersions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Extension</label>
          <div className="relative">
            <select value={effectiveImageExt} onChange={e => setImageExt(e.target.value)} className={`${sel} w-full appearance-none pr-6`}>
              {imageExts.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Short SHA</label>
          <input value={shortSha} onChange={e => setShortSha(e.target.value)} maxLength={12} placeholder="abc1234" className={inp} />
        </div>
        {mode === 'nightly' ? (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Build Date (YYYYMMDD)</label>
            <input value={buildDate} onChange={e => setBuildDate(e.target.value)} placeholder="today" maxLength={8} className={inp} />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Release Version</label>
            <input value={releaseVer} onChange={e => setReleaseVer(e.target.value)} placeholder="2.3.2" className={inp} />
          </div>
        )}
      </div>

      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
              data.supported ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {data.supported ? '✅ Supported cell' : '❌ Unsupported cell'}
            </span>
            {!data.supported && <span className="text-[11px] text-gray-500">{data.unsupported_reason}</span>}
            {isFetching && <span className="text-[10px] text-gray-400">computing…</span>}
          </div>
          {data.supported && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">NGC tags</p>
                <div className="space-y-1">{(data.ngc_tags as string[]).map(t => <CopyTag key={t} value={t} />)}</div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">GHCR tags</p>
                <div className="space-y-1">{(data.ghcr_tags as string[]).map(t => <CopyTag key={t} value={t} />)}</div>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Build config</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="bg-surface-2 border border-border rounded px-2 py-1">
                    <span className="text-gray-500">Dockerfile:</span> <code className="text-gray-300 font-mono">{data.dockerfile}</code>
                  </span>
                  {data.compose_overlay && (
                    <span className="bg-surface-2 border border-border rounded px-2 py-1">
                      <span className="text-gray-500">Compose:</span> <code className="text-gray-300 font-mono">{data.compose_overlay}</code>
                    </span>
                  )}
                  <span className="bg-surface-2 border border-border rounded px-2 py-1">
                    <span className="text-gray-500">Cache:</span> <code className="text-gray-300 font-mono">{data.ghcr_cache}</code>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Lifecycle policy ──────────────────────────────────────────────────────────

function LifecycleSection() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({ queryKey: [slug, 'tags-lifecycle'], queryFn: getTagsLifecycle, staleTime: Infinity })
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
                <td className="py-2 px-3"><code className="text-accent-blue font-mono text-[11px]">{p.pattern}</code></td>
                <td className="py-2 px-3">{p.permanent ? <span className="text-accent-green font-medium">permanent</span> : <span className="text-gray-300">{p.ttl_days}d</span>}</td>
                <td className="py-2 px-3 text-gray-400">{p.age_source}</td>
                <td className="py-2 px-3">
                  {Array.isArray(p.registries)
                    ? p.registries.map((r: string) => <span key={r} className="mr-1 inline-flex items-center gap-1 text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-gray-400">{r}</span>)
                    : <span className="text-gray-500 text-[11px]">{p.registries}</span>
                  }
                </td>
                <td className="py-2 px-3"><code className="text-gray-500 font-mono text-[10px]">{p.example}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── OCI labels ────────────────────────────────────────────────────────────────

function buildOciLabels(repoSlug: string) {
  const [owner = '', repo = ''] = repoSlug.split('/')
  const isIsaacLab = repo.toLowerCase().includes('isaaclab')
  const ns = isIsaacLab ? 'com.nvidia.isaaclab' : `com.github.${owner.toLowerCase()}.${repo.toLowerCase()}`
  return [
    { key: 'org.opencontainers.image.source',   value: `https://github.com/${repoSlug}` },
    { key: 'org.opencontainers.image.revision',  value: 'full git SHA' },
    { key: 'org.opencontainers.image.created',   value: 'build timestamp' },
    { key: `${ns}.build-type`,                   value: 'nightly | release' },
    ...(isIsaacLab ? [
      { key: `${ns}.isaac-sim-version`, value: 'e.g. 4.5.0' },
      { key: `${ns}.image-ext`,         value: 'base | ros2 | cloudxr | ngc-slim' },
    ] : []),
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
                <td className="py-2 px-3"><code className="text-accent-blue font-mono text-[11px]">{l.key}</code></td>
                <td className="py-2 px-3 text-gray-400">{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">All six labels are validated by <code className="font-mono">verify-push.py</code> after every push.</p>
    </div>
  )
}

// ── Registry comparison ───────────────────────────────────────────────────────

const REGISTRY_ROWS = [
  { feature: 'Nightly tags',          ngc: true,  ghcr: true  },
  { feature: 'SHA tags',              ngc: true,  ghcr: true  },
  { feature: 'Release / latest tags', ngc: true,  ghcr: true  },
  { feature: 'BuildKit cache',        ngc: false, ghcr: true  },
  { feature: 'Lifecycle TTL cleanup', ngc: false, ghcr: true  },
]

function RegistryComparison({ repoSlug, isIsaacLab }: { repoSlug: string; isIsaacLab: boolean }) {
  const [owner = '', repo = ''] = repoSlug.split('/')
  const ownerL = owner.toLowerCase()
  const repoL = repo.toLowerCase()

  // Generic repos don't publish to NVIDIA NGC — show a GHCR-only view instead of
  // an NGC-vs-GHCR comparison that implies an nvcr.io presence they don't have.
  if (!isIsaacLab) {
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
            <code className="text-gray-400 font-mono">ghcr.io/{ownerL}/{repoL}</code>
            <p className="text-gray-400 mt-0.5">Auth: GITHUB_TOKEN / PAT</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-head">Registry Comparison</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Feature</th>
              <th className="text-center py-2 px-3 text-gray-400 font-mono">NGC</th>
              <th className="text-center py-2 px-3 text-gray-400 font-mono">GHCR</th>
            </tr>
          </thead>
          <tbody>
            {REGISTRY_ROWS.map(r => (
              <tr key={r.feature} className="border-t border-border/50 hover:bg-surface-2/30">
                <td className="py-2 px-3 text-gray-300">{r.feature}</td>
                <td className="py-2 px-3 text-center">{r.ngc ? '✅' : '❌'}</td>
                <td className="py-2 px-3 text-center">{r.ghcr ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-surface-2 border border-border rounded px-2 py-1.5">
          <p className="text-gray-500 mb-0.5">NGC</p>
          <code className="text-gray-400 font-mono">nvcr.io/nvidia/{repoL.replace(/_/g, '-')}</code>
          <p className="text-gray-400 mt-0.5">Auth: NGC_API_KEY</p>
        </div>
        <div className="bg-surface-2 border border-border rounded px-2 py-1.5">
          <p className="text-gray-500 mb-0.5">GHCR</p>
          <code className="text-gray-400 font-mono">ghcr.io/{ownerL}/{repoL}</code>
          <p className="text-gray-400 mt-0.5">Auth: GITHUB_TOKEN / PAT</p>
        </div>
      </div>
    </div>
  )
}

// ── Promotion flow ────────────────────────────────────────────────────────────

function PromotionFlow() {
  return (
    <div>
      <div className="section-head">Promotion Flow</div>
      <div className="bg-surface-2 border border-border rounded p-3 font-mono text-[11px] text-gray-400 whitespace-pre leading-relaxed">
        {`nightly-build.yaml
  │ builds & smoke-tests all 10 cells
  │ pushes nightly-{DATE}-{ext}-sim{M.m}
  │         sha-{7CHAR}-{ext}-sim{M.m}
  │         cache-{ext}-sim{M.m}  (GHCR only)
  ▼
release-image.yaml  (triggered by git tag v{semver})
  │ calls promote-nightly.py
  │ pulls nightly from GHCR by nightly tag
  │ retags → {semver}-{ext}-sim{M.m}
  │          latest-{ext}-sim{M.m}
  │          sha-{7CHAR}-{ext}-sim{M.m}
  │ pushes to NGC + GHCR
  ▼
verify-push.py validates all 6 OCI labels`}
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        Release images are <strong className="text-gray-400">identical bits</strong> to the tested nightly — no rebuild risk.
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegistryManager() {
  const slug = useRepoSlug()
  const [tab, setTab] = useState<RegistryTab>('images')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const qc = useQueryClient()

  const { data: uriData } = useQuery({ queryKey: [slug, 'ecr-uri'], queryFn: getECRUri })
  const { data: pushStatus } = useQuery({ queryKey: [slug, 'registry-push-status'], queryFn: getRegistryPushStatus, staleTime: 60_000 })
  const { data: activeRepo } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const ngcImage: string = pushStatus?.ngc?.image ?? ''

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [slug, 'ecr-images'],
    queryFn: () => getECRImages(100),
    refetchInterval: 60_000,
  })

  const { mutate: deleteImg } = useMutation({
    mutationFn: (tag: string) => deleteECRImage(tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: [slug, 'ecr-images'] }),
    onError: () => toast.error('Failed to delete image'),
  })

  const images: ECRImage[] = data?.images ?? []
  const ecrUri = uriData?.uri ?? ''
  const repoSlug = activeRepo?.active?.slug ?? ''
  const isIsaacLab = repoSlug.toLowerCase().includes('isaaclab')

  const totalSize = images.reduce((acc, img) => acc + img.size_mb, 0)
  const totalSizeLabel = totalSize >= 1000 ? `${(totalSize / 1024).toFixed(1)} GB` : `${totalSize.toFixed(0)} MB`

  const tagPrefixes = useMemo(() => {
    const freq = new Map<string, number>()
    images.forEach((img) => {
      img.tags.forEach((t) => {
        const prefix = t.split('-')[0] || t.split(':')[0] || t
        freq.set(prefix, (freq.get(prefix) ?? 0) + 1)
      })
    })
    return Array.from(freq.entries())
      .filter(([p, c]) => c > 1 && p.length > 1 && p.length < 20)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([p]) => p)
  }, [images])

  const displayed = useMemo(() => {
    let list = images
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((img) => img.tags.some((t) => t.toLowerCase().includes(q)) || img.digest.includes(q))
    }
    if (tagFilter) list = list.filter((img) => img.tags.some((t) => t.startsWith(tagFilter)))
    switch (sortKey) {
      case 'date_asc':  list = [...list].sort((a, b) => new Date(a.pushed_at).getTime() - new Date(b.pushed_at).getTime()); break
      case 'size_desc': list = [...list].sort((a, b) => b.size_mb - a.size_mb); break
      case 'size_asc':  list = [...list].sort((a, b) => a.size_mb - b.size_mb); break
      default: list = [...list].sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime())
    }
    return list
  }, [images, search, tagFilter, sortKey])

  const latestImage = images.find((img) => img.tags.includes('latest'))

  return (
    <div className="space-y-5">

      {/* Registry info cards — ECR always; NGC only for NVIDIA IsaacLab */}
      <div className={clsx('grid grid-cols-1 gap-3', isIsaacLab && 'md:grid-cols-2')}>
        {/* ECR */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-950 flex items-center justify-center">
              <span className="text-accent-orange text-xs font-bold">ECR</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">AWS ECR</p>
              <p className="text-[10px] text-gray-500">us-east-1</p>
            </div>
          </div>
          {ecrUri && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-500 flex-shrink-0">URI:</span>
              <span className="font-mono text-gray-300 truncate flex-1 min-w-0">{ecrUri}</span>
              <CopyButton text={ecrUri} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-lg font-semibold text-white tabular-nums">{images.length}</p>
              <p className="text-[9px] text-gray-500">images</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-sm font-semibold text-white">{totalSizeLabel}</p>
              <p className="text-[9px] text-gray-500">total size</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-sm font-semibold text-accent-green truncate">
                {latestImage ? formatDistanceToNow(new Date(latestImage.pushed_at), { addSuffix: true }) : '—'}
              </p>
              <p className="text-[9px] text-gray-500">latest push</p>
            </div>
          </div>
        </div>

        {/* NGC — NVIDIA-specific; only for IsaacLab repos */}
        {isIsaacLab && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-950 flex items-center justify-center">
              <span className="text-accent-green text-xs font-bold">NGC</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">NVIDIA NGC</p>
              <p className="text-[10px] text-gray-500">nvcr.io</p>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 space-y-1">
            {ngcImage && <div>Image: <span className="text-gray-300 font-mono">{ngcImage}</span></div>}
          </div>
          <div className="bg-surface rounded-lg p-3">
            <p className="text-[10px] text-gray-500 mb-1.5">Login command</p>
            <div className="flex items-center gap-2">
              <code className="text-accent-blue text-[10px] font-mono flex-1 break-all">
                docker login nvcr.io -u $oauthtoken -p $NGC_API_KEY
              </code>
              <CopyButton text="docker login nvcr.io -u $oauthtoken -p $NGC_API_KEY" />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Tab navigation */}
      <TabBar
        tabs={[
          { id: 'images',    icon: Layers,   label: 'Images'        },
          { id: 'tags',      icon: Tag,      label: 'Tags & Naming' },
          { id: 'lifecycle', icon: Database, label: 'Lifecycle'     },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Images tab */}
      {tab === 'images' && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border card-head flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags or digest…"
                className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-44 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              />
            </div>
            {tagPrefixes.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => setTagFilter('')}
                  className={clsx('px-2 py-0.5 rounded text-[9px] font-medium transition-colors',
                    tagFilter === '' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
                  All
                </button>
                {tagPrefixes.map((p) => (
                  <button key={p} onClick={() => setTagFilter(tagFilter === p ? '' : p)}
                    className={clsx('px-2 py-0.5 rounded text-[9px] font-medium font-mono transition-colors',
                      tagFilter === p ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown size={10} className="text-gray-500" />
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none">
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="size_desc">Largest first</option>
                <option value="size_asc">Smallest first</option>
              </select>
            </div>
            <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
              <RefreshCw size={11} />
            </button>
            <span className="text-[10px] text-gray-400">{displayed.length} / {images.length} images</span>
          </div>

          {isLoading && <div className="text-center py-10 text-gray-500 text-sm">Loading images…</div>}
          {isError && (
            <div className="flex items-center justify-center gap-2 py-10 text-red-400 text-sm">
              <AlertTriangle size={16} /> Failed to fetch ECR images — check AWS credentials
            </div>
          )}
          {!isLoading && !isError && displayed.length === 0 && (
            <div className="text-center py-10 flex flex-col items-center gap-2">
              <Package size={28} className="text-gray-400" />
              <p className="text-gray-400 text-sm">{images.length === 0 ? 'No images found in ECR.' : 'No images match the current filter.'}</p>
            </div>
          )}
          {!isLoading && !isError && displayed.length > 0 && (
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/30">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {['Tags', 'Digest', 'Pushed', 'Size', '', ''].map((h, i) => (
                    <th key={i} className="px-4 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((img) => (
                  <ImageRow key={img.digest} image={img} onDelete={deleteImg} ecrUri={ecrUri} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tags & Naming tab */}
      {tab === 'tags' && (
        <div className="space-y-4">
          {isIsaacLab ? (
            <>
              <div className="bg-surface-1 border border-border rounded-xl p-4">
                <div className="section-head mb-4">Tag Calculator</div>
                <TagCalculator />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-surface-1 border border-border rounded-xl p-4"><MatrixSection /></div>
                <div className="bg-surface-1 border border-border rounded-xl p-4"><RegistryComparison repoSlug={repoSlug} isIsaacLab={isIsaacLab} /></div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-surface-1 border border-border rounded-xl p-4">
                <div className="section-head mb-2">Tag Calculator</div>
                <p className="text-[12px] text-gray-500">
                  The Isaac Sim tag naming scheme is specific to the IsaacLab publishing pipeline and does not apply to <span className="text-gray-300">{repoSlug}</span>.
                </p>
              </div>
              <div className="bg-surface-1 border border-border rounded-xl p-4"><RegistryComparison repoSlug={repoSlug} isIsaacLab={isIsaacLab} /></div>
            </>
          )}
        </div>
      )}

      {/* Lifecycle tab */}
      {tab === 'lifecycle' && (
        <div className="space-y-4">
          {isIsaacLab && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-surface-1 border border-border rounded-xl p-4"><LifecycleSection /></div>
              <div className="bg-surface-1 border border-border rounded-xl p-4"><OciLabels repoSlug={repoSlug} /></div>
            </div>
          )}
          {!isIsaacLab && (
            <div className="bg-surface-1 border border-border rounded-xl p-4"><OciLabels repoSlug={repoSlug} /></div>
          )}
          {isIsaacLab && (
            <div className="bg-surface-1 border border-border rounded-xl p-4"><PromotionFlow /></div>
          )}
        </div>
      )}

    </div>
  )
}
