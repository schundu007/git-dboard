import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Layers, RefreshCw, Copy, Trash2, CheckCircle, Search,
  ArrowUpDown, Package, AlertTriangle,
} from 'lucide-react'
import { getECRImages, getECRUri, deleteECRImage } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import type { ECRImage } from '../lib/types'
import clsx from 'clsx'

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
              <span className="text-gray-600 font-mono text-[10px]">(untagged)</span>
            )}
            {image.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className={clsx(
                  'px-1.5 py-0.5 rounded font-mono text-[10px]',
                  t === 'latest'
                    ? 'bg-green-950 text-accent-green'
                    : t.startsWith('main') || t.match(/^v\d/)
                    ? 'bg-blue-950 text-accent-blue'
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
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-950 text-accent-green">latest</span>
            )}
            {isMain && !isLatest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-accent-blue">main</span>
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
                  className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-red-400 hover:bg-red-900 transition-colors whitespace-nowrap"
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

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc'

export default function RegistryManager() {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const qc = useQueryClient()

  const { data: uriData } = useQuery({ queryKey: ['ecr-uri'], queryFn: getECRUri })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ecr-images'],
    queryFn: () => getECRImages(100),
    refetchInterval: 60_000,
  })

  const { mutate: deleteImg } = useMutation({
    mutationFn: (tag: string) => deleteECRImage(tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ecr-images'] }),
  })

  const images: ECRImage[] = data?.images ?? []
  const ecrUri = uriData?.uri ?? ''

  const totalSize = images.reduce((acc, img) => acc + img.size_mb, 0)
  const totalSizeLabel = totalSize >= 1000
    ? `${(totalSize / 1024).toFixed(1)} GB`
    : `${totalSize.toFixed(0)} MB`

  // Tag prefix quick-filters (top recurring prefixes)
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

  // Filter + sort
  const displayed = useMemo(() => {
    let list = images
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((img) => img.tags.some((t) => t.toLowerCase().includes(q)) || img.digest.includes(q))
    }
    if (tagFilter) {
      list = list.filter((img) => img.tags.some((t) => t.startsWith(tagFilter)))
    }
    switch (sortKey) {
      case 'date_asc': list = [...list].sort((a, b) => new Date(a.pushed_at).getTime() - new Date(b.pushed_at).getTime()); break
      case 'size_desc': list = [...list].sort((a, b) => b.size_mb - a.size_mb); break
      case 'size_asc': list = [...list].sort((a, b) => a.size_mb - b.size_mb); break
      default: list = [...list].sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime())
    }
    return list
  }, [images, search, tagFilter, sortKey])

  const latestImage = images.find((img) => img.tags.includes('latest'))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers size={18} className="text-accent-purple" />
          <h1 className="text-lg font-semibold">Registry</h1>
          {images.length > 0 && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {images.length} images
            </span>
          )}
        </div>
        <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Registry info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* ECR card */}
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

        {/* NGC card */}
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
            <div>Base image: <span className="text-gray-300 font-mono">nvcr.io/nvidia/isaac-sim</span></div>
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
      </div>

      {/* Image table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags or digest…"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-44 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue"
            />
          </div>

          {/* Tag prefix quick-filters */}
          {tagPrefixes.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setTagFilter('')}
                className={clsx(
                  'px-2 py-0.5 rounded text-[9px] font-medium transition-colors',
                  tagFilter === '' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                All
              </button>
              {tagPrefixes.map((p) => (
                <button
                  key={p}
                  onClick={() => setTagFilter(tagFilter === p ? '' : p)}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[9px] font-medium font-mono transition-colors',
                    tagFilter === p ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown size={10} className="text-gray-500" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none"
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="size_desc">Largest first</option>
              <option value="size_asc">Smallest first</option>
            </select>
          </div>

          <span className="text-[10px] text-gray-600">
            {displayed.length} / {images.length} images · click row to expand
          </span>
        </div>

        {isLoading && (
          <div className="text-center py-10 text-gray-500 text-sm">Loading images…</div>
        )}

        {isError && (
          <div className="flex items-center justify-center gap-2 py-10 text-red-400 text-sm">
            <AlertTriangle size={16} />
            Failed to fetch ECR images — check AWS credentials
          </div>
        )}

        {!isLoading && !isError && displayed.length === 0 && (
          <div className="text-center py-10 flex flex-col items-center gap-2">
            <Package size={28} className="text-gray-700" />
            <p className="text-gray-600 text-sm">
              {images.length === 0 ? 'No images found in ECR.' : 'No images match the current filter.'}
            </p>
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
    </div>
  )
}
