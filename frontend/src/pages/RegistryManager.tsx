import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Layers, RefreshCw, Copy, Trash2, CheckCircle, Search,
  ArrowUpDown, Package, AlertTriangle, Check,
  Tag, Database,
} from 'lucide-react'
import { getECRImages, getECRUri, deleteECRImage, getTagsLifecycle, getActiveRepo } from '../lib/api'
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
                <td className="py-2 px-3"><code className="text-accent-blue font-mono text-[11px]">{l.key}</code></td>
                <td className="py-2 px-3 text-gray-400">{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">All labels are validated by <code className="font-mono">verify-push.py</code> after every push.</p>
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
  const [owner = '', repo = ''] = repoSlug.split('/')
  const ownerL = owner.toLowerCase()
  const repoL = repo.toLowerCase()

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegistryManager() {
  const slug = useRepoSlug()
  const [tab, setTab] = useState<RegistryTab>('images')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const qc = useQueryClient()

  const { data: uriData } = useQuery({ queryKey: [slug, 'ecr-uri'], queryFn: getECRUri })
  const { data: activeRepo } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })

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

      {/* Registry info card — ECR */}
      <div className="grid grid-cols-1 gap-3">
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
          <div className="bg-surface-1 border border-border rounded-xl p-4"><RegistryComparison repoSlug={repoSlug} /></div>
        </div>
      )}

      {/* Lifecycle tab */}
      {tab === 'lifecycle' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-1 border border-border rounded-xl p-4"><LifecycleSection /></div>
          <div className="bg-surface-1 border border-border rounded-xl p-4"><OciLabels repoSlug={repoSlug} /></div>
        </div>
      )}

    </div>
  )
}
