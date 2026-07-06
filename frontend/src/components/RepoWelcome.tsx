import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cpu, Plus, CheckCircle2, XCircle, Loader2,
  Link as LinkIcon, Key, ArrowRight, GitBranch,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { addRepo, activateRepo, testRepoConnection, getActiveRepo, getRepos } from '../lib/api'

const getApiUrl = () => localStorage.getItem('api_url') || 'http://localhost:8000'

function parseGitHubUrl(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim().replace(/\.git$/, '')
  const full = s.match(/github\.com\/([^/]+)\/([^/?\s]+)/)
  if (full) return { owner: full[1], repo: full[2] }
  const short = s.match(/^([^/]+)\/([^/?\s]+)$/)
  if (short) return { owner: short[1], repo: short[2] }
  return null
}

export default function RepoWelcome() {
  const qc = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [form, setForm] = useState({ name: '', owner: '', repo: '', gh_pat: '' })
  const [showPat, setShowPat] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  const { data: activeData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const { data: reposData } = useQuery({ queryKey: ['repos'], queryFn: getRepos, staleTime: 10_000 })

  const envRepo = activeData?.source === 'env' ? activeData?.active : null
  const savedRepos: any[] = reposData?.repos ?? []

  const handleUrlPaste = (raw: string) => {
    setUrlInput(raw)
    setUrlError('')
    if (!raw.trim()) return
    const parsed = parseGitHubUrl(raw)
    if (parsed) {
      setForm(f => ({ ...f, owner: parsed.owner, repo: parsed.repo, name: f.name || `${parsed.owner}/${parsed.repo}` }))
      setTestResult(null)
    } else if (raw.length > 5) {
      setUrlError('Expected github.com/owner/repo or owner/repo')
    }
  }

  const handleTest = async () => {
    if (!form.owner || !form.repo) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testRepoConnection(form)
      setTestResult(res)
      if (res.ok && !form.name)
        setForm(f => ({ ...f, name: res.repo?.full_name ?? `${form.owner}/${form.repo}` }))
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const switchTo = async (id: number, slug: string) => {
    setSwitching(slug)
    try {
      await activateRepo(id)
      await fetch(`${getApiUrl()}/cache/clear`, { method: 'POST' }).catch(() => {})
    } catch { setSwitching(null); return }
    qc.clear()
    localStorage.setItem('repo-onboarded', '1')
    setTimeout(() => { window.location.href = '/' }, 600)
  }

  const addMut = useMutation({
    mutationFn: () => addRepo(form),
    onSuccess: async (created: any) => {
      if (created?.id) switchTo(created.id, created.slug ?? created.name)
    },
  })

  const continueWithEnv = () => {
    localStorage.setItem('repo-onboarded', '1')
    // Force re-render by changing a query key
    qc.invalidateQueries({ queryKey: ['active-repo'] })
    window.location.reload()
  }

  const canAdd = form.owner.trim() && form.repo.trim()

  if (switching) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/80 flex flex-col items-center justify-center gap-4">
        <Loader2 size={28} className="text-brand animate-spin" />
        <p className="text-[14px] font-semibold text-white">Setting up {switching}…</p>
        <p className="text-[11px] text-gray-400">Loading dashboard…</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] dark-surface flex items-center justify-center p-4">
      <div className="w-full max-w-[480px] space-y-6">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand/15 flex items-center justify-center">
            <Cpu size={22} className="text-brand" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-white tracking-tight">DevOps Dashboard</h1>
            <p className="text-[13px] text-gray-500 mt-1">Connect a GitHub repository to get started</p>
          </div>
        </div>

        {/* Saved repos (if any) */}
        {savedRepos.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Saved repositories</p>
            <div className="space-y-1.5">
              {savedRepos.map((r: any) => {
                const slug = r.slug ?? `${r.owner}/${r.repo}`
                return (
                  <button
                    key={r.id}
                    onClick={() => switchTo(r.id, slug)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-1 border border-border hover:border-brand/40 hover:bg-brand/[.04] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center text-[13px] font-bold text-gray-400 flex-shrink-0 group-hover:bg-brand/15 group-hover:text-brand transition-colors">
                      {slug.split('/')[1]?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 text-left flex-1">
                      <p className="text-[13px] font-semibold text-white truncate">{slug.split('/')[1]}</p>
                      <p className="text-[11px] text-gray-400 font-mono truncate">{slug.split('/')[0]}</p>
                    </div>
                    <ArrowRight size={14} className="text-gray-400 group-hover:text-brand transition-colors flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Add new repo form */}
        <div className="bg-surface-1 border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border card-head flex items-center gap-2">
            <Plus size={13} className="text-brand" />
            <span className="text-[13px] font-semibold text-white">Add a repository</span>
          </div>
          <div className="p-4 space-y-3">
            {/* URL paste */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <LinkIcon size={9} />
                GitHub URL
                <span className="text-gray-400 normal-case font-normal ml-1">paste to auto-fill owner and repo</span>
              </label>
              <input
                value={urlInput}
                onChange={e => handleUrlPaste(e.target.value)}
                placeholder="https://github.com/owner/repo"
                autoFocus
                className={cn(
                  'w-full bg-surface-2 border rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-gray-500 focus:outline-none transition-colors font-mono',
                  urlError ? 'border-accent-red/50 focus:border-accent-red' : 'border-border focus:border-brand/60',
                )}
              />
              {urlError && <p className="text-[10px] text-accent-red mt-1">{urlError}</p>}
              {!urlError && form.owner && form.repo && (
                <p className="text-[10px] text-brand mt-1 flex items-center gap-1">
                  <CheckCircle2 size={9} />
                  <span className="font-mono">{form.owner}/{form.repo}</span>
                </p>
              )}
            </div>

            {/* Manual inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rw-owner" className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Owner / Org *</label>
                <input
                  id="rw-owner"
                  value={form.owner}
                  onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                  placeholder="owner"
                  pattern="[A-Za-z0-9_.-]+"
                  aria-describedby="rw-owner-hint"
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-brand/60 transition-colors font-mono"
                />
                <span id="rw-owner-hint" className="sr-only">GitHub owner or organization name</span>
              </div>
              <div>
                <label htmlFor="rw-repo" className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Repository *</label>
                <input
                  id="rw-repo"
                  value={form.repo}
                  onChange={e => setForm(f => ({ ...f, repo: e.target.value }))}
                  placeholder="repo"
                  pattern="[A-Za-z0-9_.-]+"
                  aria-describedby="rw-repo-hint"
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-brand/60 transition-colors font-mono"
                />
                <span id="rw-repo-hint" className="sr-only">GitHub repository name</span>
              </div>
            </div>

            {/* PAT toggle */}
            <div>
              <button
                onClick={() => setShowPat(v => !v)}
                className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <Key size={9} />
                {showPat ? 'Hide PAT' : 'Add GitHub PAT for private repos (optional)'}
              </button>
              {showPat && (
                <input
                  value={form.gh_pat}
                  onChange={e => setForm(f => ({ ...f, gh_pat: e.target.value }))}
                  placeholder="ghp_xxxxxxxxxxxx"
                  type="password"
                  className="mt-2 w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-brand/60 transition-colors font-mono"
                />
              )}
            </div>

            {/* Test result */}
            {testResult && (
              <div className={cn(
                'flex items-start gap-2 p-3 rounded-xl text-[11px]',
                testResult.ok
                  ? 'bg-brand/[.06] border border-brand/20 text-brand'
                  : 'bg-accent-red/[.08] border border-accent-red/20 text-accent-red',
              )}>
                {testResult.ok
                  ? <CheckCircle2 size={13} className="flex-shrink-0 mt-px" />
                  : <XCircle size={13} className="flex-shrink-0 mt-px" />
                }
                <span>{testResult.ok ? `Connected — ${testResult.repo?.full_name ?? 'ok'}` : testResult.error}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleTest}
                disabled={!canAdd || testing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] border border-border bg-surface-2 text-gray-300 hover:border-neutral-500 disabled:opacity-40 transition-colors"
              >
                {testing ? <Loader2 size={11} className="animate-spin" /> : null}
                Test connection
              </button>
              <button
                onClick={() => addMut.mutate()}
                disabled={!canAdd || addMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold bg-brand text-[#0f1a00] hover:bg-brand/90 disabled:opacity-40 transition-colors"
              >
                {addMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={13} />}
                Add &amp; open dashboard
              </button>
            </div>
            {addMut.isError && (() => {
              const msg = (addMut.error as Error)?.message ?? ''
              const alreadyAdded = msg.toLowerCase().includes('already added')
              return (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-accent-red/[.08] border border-accent-red/20 text-accent-red text-[11px]">
                  <XCircle size={13} className="flex-shrink-0" />
                  <span className="flex-1">{alreadyAdded ? 'Repository already added.' : msg}</span>
                  {alreadyAdded && form.owner && form.repo && (
                    <a
                      href={`https://github.com/${form.owner}/${form.repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-accent-red/80 hover:text-accent-red whitespace-nowrap"
                    >
                      Open on GitHub ↗
                    </a>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Continue with env */}
        {envRepo?.slug && (
          <div className="text-center">
            <p className="text-[11px] text-gray-400 mb-2">
              Or continue with the environment default:
            </p>
            <button
              onClick={continueWithEnv}
              className="inline-flex items-center gap-2 text-[11px] text-gray-400 hover:text-white border border-border rounded-lg px-4 py-2 hover:bg-surface-2 transition-colors"
            >
              <GitBranch size={11} />
              <span className="font-mono">{envRepo.slug}</span>
              <ArrowRight size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
