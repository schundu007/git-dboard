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

// ── Build matrix grid ────────────────────────────────────────────────────────

function MatrixSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['tags-matrix'],
    queryFn: getTagsMatrix,
    staleTime: Infinity,
  })

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
        Loading matrix…
      </div>
    )
  }

  const simVersions: string[] = data?.sim_versions ?? []
  const imageExts: string[]   = data?.image_exts   ?? []
  const cells: any[]          = data?.cells         ?? []

  const cellFor = (sim: string, ext: string) =>
    cells.find(c => c.sim_version === sim && c.image_ext === ext)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white">Build Status</h2>
        <span className="text-[11px] text-gray-500 font-mono">
          {data?.total_valid ?? 0} valid · {data?.total_skipped ?? 0} skipped
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-gray-500 font-medium w-28">Extension</th>
              {simVersions.map(v => (
                <th key={v} className="text-center py-2 px-3 text-gray-400 font-mono font-medium">
                  Sim {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {imageExts.map(ext => (
              <tr key={ext} className="border-t border-border/50">
                <td className="py-2.5 px-3">
                  <code className="text-accent-blue font-mono">{ext}</code>
                </td>
                {simVersions.map(sim => {
                  const cell = cellFor(sim, ext)
                  const supported = cell?.supported ?? false
                  return (
                    <td key={sim} className="py-2.5 px-3 text-center">
                      {supported ? (
                        <span className="inline-block text-accent-green" title={cell?.cell_slug}>✅</span>
                      ) : (
                        <span
                          className="inline-block text-gray-400 cursor-help"
                          title={cell?.unsupported_reason ?? 'Not supported'}
                        >
                          ❌
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-gray-400">
        ❌ = ngc-slim pre-built container not yet published by NVIDIA for this Isaac Sim version
      </p>
    </div>
  )
}

// ── Tag calculator ───────────────────────────────────────────────────────────

function TagCalculator() {
  const { data: matrixData } = useQuery({
    queryKey: ['tags-matrix'],
    queryFn: getTagsMatrix,
    staleTime: Infinity,
  })
  const simVersions: string[] = matrixData?.sim_versions ?? ['4.5.0', '5.0.0', '5.1.0']
  const imageExts: string[]   = matrixData?.image_exts   ?? ['base', 'ros2', 'cloudxr', 'ngc-slim']

  const [mode, setMode]               = useState<'nightly' | 'release'>('nightly')
  const [simVersion, setSimVersion]   = useState('')
  const [imageExt, setImageExt]       = useState('')

  const effectiveSimVersion = simVersion || simVersions[0] || '4.5.0'
  const effectiveImageExt   = imageExt   || imageExts[0]   || 'base'
  const [shortSha, setShortSha]       = useState('abc1234')
  const [buildDate, setBuildDate]     = useState('')
  const [releaseVer, setReleaseVer]   = useState('2.3.2')

  const params = {
    mode,
    sim_version: effectiveSimVersion,
    image_ext:   effectiveImageExt,
    short_sha:   shortSha,
    ...(mode === 'nightly' && buildDate   ? { build_date:       buildDate }   : {}),
    ...(mode === 'release' && releaseVer  ? { release_version:  releaseVer }  : {}),
  }

  const { data, isFetching } = useQuery({
    queryKey: ['tags-compute', params],
    queryFn: () => getTagsCompute(params),
    staleTime: 5_000,
  })

  const select = 'bg-surface-2 border border-border rounded px-2 py-1.5 text-[12px] text-gray-200 focus:outline-none focus:border-accent-blue/50'
  const input  = 'bg-surface-2 border border-border rounded px-2 py-1.5 text-[12px] text-gray-200 font-mono focus:outline-none focus:border-accent-blue/50 w-full'

  return (
    <div>
      <div className="section-head">Tag Calculator</div>

      {/* Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {/* Mode */}
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Mode</label>
          <div className="flex rounded overflow-hidden border border-border">
            {(['nightly', 'release'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                  mode === m ? 'bg-accent-blue text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Sim version */}
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Sim Version</label>
          <div className="relative">
            <select value={effectiveSimVersion} onChange={e => setSimVersion(e.target.value)} className={`${select} w-full appearance-none pr-6`}>
              {simVersions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Image extension */}
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Extension</label>
          <div className="relative">
            <select value={effectiveImageExt} onChange={e => setImageExt(e.target.value)} className={`${select} w-full appearance-none pr-6`}>
              {imageExts.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Short SHA */}
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Short SHA</label>
          <input value={shortSha} onChange={e => setShortSha(e.target.value)} maxLength={12} placeholder="abc1234" className={input} />
        </div>

        {/* Mode-specific field */}
        {mode === 'nightly' ? (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Build Date (YYYYMMDD)</label>
            <input value={buildDate} onChange={e => setBuildDate(e.target.value)} placeholder="today" maxLength={8} className={input} />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Release Version</label>
            <input value={releaseVer} onChange={e => setReleaseVer(e.target.value)} placeholder="2.3.2" className={input} />
          </div>
        )}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-3">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
              data.supported
                ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {data.supported ? '✅ Supported cell' : '❌ Unsupported cell'}
            </span>
            {!data.supported && (
              <span className="text-[11px] text-gray-500">{data.unsupported_reason}</span>
            )}
            {isFetching && <span className="text-[10px] text-gray-400">computing…</span>}
          </div>

          {/* Tag groups */}
          {data.supported && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* NGC */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">NGC tags</p>
                <div className="space-y-1">
                  {(data.ngc_tags as string[]).map(t => <CopyTag key={t} value={t} />)}
                </div>
              </div>

              {/* GHCR */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">GHCR tags</p>
                <div className="space-y-1">
                  {(data.ghcr_tags as string[]).map(t => <CopyTag key={t} value={t} />)}
                </div>
              </div>

              {/* Meta */}
              <div className="md:col-span-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Build config</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="bg-surface-2 border border-border rounded px-2 py-1">
                    <span className="text-gray-500">Dockerfile:</span>{' '}
                    <code className="text-gray-300 font-mono">{data.dockerfile}</code>
                  </span>
                  {data.compose_overlay && (
                    <span className="bg-surface-2 border border-border rounded px-2 py-1">
                      <span className="text-gray-500">Compose:</span>{' '}
                      <code className="text-gray-300 font-mono">{data.compose_overlay}</code>
                    </span>
                  )}
                  <span className="bg-surface-2 border border-border rounded px-2 py-1">
                    <span className="text-gray-500">Cache:</span>{' '}
                    <code className="text-gray-300 font-mono">{data.ghcr_cache}</code>
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
  const isIsaacLab = repo.toLowerCase().includes('isaaclab')
  const ns = isIsaacLab
    ? 'com.nvidia.isaaclab'
    : `com.github.${owner.toLowerCase()}.${repo.toLowerCase()}`
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
        All six labels are validated by <code className="font-mono">verify-push.py</code> after every push.
      </p>
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

function RegistryComparison({ repoSlug }: { repoSlug: string }) {
  const owner = repoSlug.split('/')[0] ?? ''
  const repo = repoSlug.split('/')[1] ?? ''
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
          <code className="text-gray-400 font-mono">nvcr.io/nvidia/{repo.toLowerCase().replace(/_/g, '-')}</code>
          <p className="text-gray-400 mt-0.5">Auth: NGC_API_KEY</p>
        </div>
        <div className="bg-surface-2 border border-border rounded px-2 py-1.5">
          <p className="text-gray-500 mb-0.5">GHCR</p>
          <code className="text-gray-400 font-mono">ghcr.io/{owner.toLowerCase()}/{repo.toLowerCase()}</code>
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImageTags() {
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''
  const repoName = activeRepoData?.active?.name ?? repoSlug
  const isIsaacLab = repoSlug.toLowerCase().includes('isaaclab')

  return (
    <div className="space-y-5">

        {/* Tag calculator — IsaacLab-specific */}
        {isIsaacLab ? (
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <TagCalculator />
          </div>
        ) : (
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <div className="section-head">Tag Calculator</div>
            <p className="text-[12px] text-gray-500">
              The Isaac Sim tag naming scheme (<code className="font-mono text-gray-400">nightly-{'{date}'}-{'{ext}'}-sim{'{M.m}'}</code>) is
              specific to the IsaacLab publishing pipeline and does not apply to <span className="text-gray-300">{repoSlug}</span>.
            </p>
          </div>
        )}

        {/* Build matrix + Registry side-by-side — IsaacLab-specific */}
        {isIsaacLab ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <MatrixSection />
            </div>
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <RegistryComparison repoSlug={repoSlug} />
            </div>
          </div>
        ) : (
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <RegistryComparison repoSlug={repoSlug} />
          </div>
        )}

        {/* Lifecycle + OCI labels side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isIsaacLab && (
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <LifecycleSection />
            </div>
          )}
          <div className={isIsaacLab ? 'bg-surface-1 border border-border rounded-lg p-4' : 'bg-surface-1 border border-border rounded-lg p-4 lg:col-span-2'}>
            <OciLabels repoSlug={repoSlug} />
          </div>
        </div>

        {/* Promotion flow — IsaacLab-specific */}
        {isIsaacLab && (
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <PromotionFlow />
          </div>
        )}

    </div>
  )
}
