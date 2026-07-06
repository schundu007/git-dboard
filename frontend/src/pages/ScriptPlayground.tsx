import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { analyzeScript, type ScriptAnalysis } from '../lib/api'
import {
  Terminal, Play, Copy, CheckCircle2, AlertCircle,
  Lightbulb, BookOpen, Code2, Loader2,
  RotateCcw, Info, Zap, Bug, ChevronRight,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { toast } from 'sonner'

type Language = 'python' | 'bash' | 'dockerfile' | 'yaml' | 'compose'
type ResultTab = 'errors' | 'enhancements' | 'explanation' | 'corrected'

const LANG_META: Record<Language, { label: string; placeholder: string }> = {
  python: {
    label: 'Python',
    placeholder: '#!/usr/bin/env python3\n# Paste your Python script here…\n\ndef main():\n    print("Hello")\n\nif __name__ == "__main__":\n    main()',
  },
  bash: {
    label: 'Bash',
    placeholder: '#!/bin/bash\n# Paste your bash script here…\n\nset -euo pipefail\n\necho "Hello"',
  },
  dockerfile: {
    label: 'Dockerfile',
    placeholder: '# Paste your Dockerfile here…\n\nARG BASE_IMAGE=ubuntu:22.04\nFROM ${BASE_IMAGE}\n\nARG DEBIAN_FRONTEND=noninteractive\nRUN apt-get update && apt-get install -y \\\n    python3 python3-pip \\\n    && rm -rf /var/lib/apt/lists/*\n\nWORKDIR /app\nCOPY . .\nCMD ["python3", "main.py"]',
  },
  yaml: {
    label: 'YAML (Actions)',
    placeholder: '# Paste a GitHub Actions workflow here…\n\nname: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  build:\n    runs-on: ubuntu-22.04\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "Hello"',
  },
  compose: {
    label: 'Compose',
    placeholder: '# Paste a docker-compose.yaml here…\n\nservices:\n  app:\n    build:\n      context: .\n      dockerfile: Dockerfile\n    ports:\n      - "8000:8000"\n    volumes:\n      - ./src:/app/src\n    environment:\n      - DEBUG=1',
  },
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])
  return { copied, copy }
}

function ExampleBlock({ code }: { code: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="relative group/ex mt-2.5">
      <pre className="code-editor p-3 rounded-lg bg-[#0d0d0f] border border-border text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed pr-16">
        {code}
      </pre>
      <button
        onClick={() => copy(code)}
        className={cn(
          'absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9.5px] transition-colors',
          'opacity-0 group-hover/ex:opacity-100',
          copied
            ? 'border-brand/30 bg-brand/10 text-brand opacity-100'
            : 'border-border bg-surface-2 text-neutral-500 hover:text-neutral-200',
        )}
      >
        {copied ? <CheckCircle2 size={8} /> : <Copy size={8} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const SEVERITY = {
  high:   { label: 'High',   cls: 'bg-accent-red/10 text-accent-red ring-1 ring-accent-red/25' },
  medium: { label: 'Medium', cls: 'bg-yellow-400/10 text-yellow-400 ring-1 ring-yellow-400/20' },
  low:    { label: 'Low',    cls: 'bg-blue-400/10 text-blue-400 ring-1 ring-blue-400/20' },
}

export default function ScriptPlayground() {
  const [language, setLanguage] = useState<Language>('python')
  const [script, setScript] = useState('')
  const [activeTab, setActiveTab] = useState<ResultTab>('errors')
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputCopy = useCopy()

  const { mutate, data: result, isPending, error, reset } = useMutation({
    mutationFn: () => analyzeScript(script, language),
    onSuccess: (data: ScriptAnalysis) => {
      setActiveTab(data.errors.length > 0 ? 'errors' : 'explanation')
      toast.success('Analysis complete')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current!
      const { selectionStart: s, selectionEnd: en } = ta
      const next = ta.value.substring(0, s) + '  ' + ta.value.substring(en)
      setScript(next)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (script.trim() && !isPending) mutate()
    }
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs: { id: ResultTab; label: string; icon: typeof Bug; count?: number }[] = [
    { id: 'errors',       label: 'Errors',       icon: Bug,      count: result?.errors.length },
    { id: 'enhancements', label: 'Enhancements', icon: Zap,      count: result?.enhancements.length },
    { id: 'explanation',  label: 'Explanation',  icon: BookOpen },
    { id: 'corrected',    label: 'Fixed Script', icon: Code2 },
  ]

  return (
    <div className="flex flex-col h-full p-6 gap-5 min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between flex-shrink-0">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-semibold text-white">
            <Terminal size={16} className="text-brand" />
            Script Playground
          </h1>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            Paste a script or config file — get errors, enhancements, explanation, and a corrected version
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <kbd className="px-1.5 py-0.5 bg-surface-2 border border-border rounded font-mono text-[10px]">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
          </kbd>
          <kbd className="px-1.5 py-0.5 bg-surface-2 border border-border rounded font-mono text-[10px]">↵</kbd>
          <span>to analyze</span>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex gap-4 min-h-0">

        {/* ── Left: Code editor ── */}
        <div className="flex flex-col w-1/2 min-h-0 gap-3">

          {/* Language + clear row */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex p-1 bg-surface-2 border border-border rounded-lg gap-0.5 flex-wrap">
              {(Object.keys(LANG_META) as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); reset() }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    language === lang
                      ? 'bg-brand/15 text-brand border border-brand/25'
                      : 'text-neutral-500 hover:text-neutral-300',
                  )}
                >
                  {LANG_META[lang].label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setScript(''); reset() }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-neutral-400 hover:text-neutral-300 hover:bg-surface-2 border border-transparent hover:border-border transition-all"
            >
              <RotateCcw size={10} />
              Clear
            </button>
          </div>

          {/* Textarea */}
          <div className="flex-1 relative min-h-0 rounded-xl border border-border bg-[#0d0d0f] overflow-hidden focus-within:border-neutral-700 transition-colors">
            {/* Language badge + copy */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
              <button
                onClick={() => script.trim() && inputCopy.copy(script)}
                disabled={!script.trim()}
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors disabled:opacity-30',
                  inputCopy.copied
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border bg-surface-2 text-neutral-500 hover:text-neutral-200 hover:border-neutral-600',
                )}
              >
                {inputCopy.copied ? <CheckCircle2 size={9} /> : <Copy size={9} />}
                {inputCopy.copied ? 'Copied' : 'Copy'}
              </button>
              <div className="px-2 py-0.5 bg-surface-2 border border-border rounded text-[10px] font-mono text-neutral-400 select-none">
                {LANG_META[language].label}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={script}
              onChange={e => setScript(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={LANG_META[language].placeholder}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="code-editor absolute inset-0 w-full h-full resize-none bg-transparent font-mono text-[12.5px] leading-[1.75] px-5 py-4 focus:outline-none"
            />
          </div>

          {/* Analyze button */}
          <button
            onClick={() => mutate()}
            disabled={!script.trim() || isPending}
            className={cn(
              'flex-shrink-0 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all',
              'bg-brand/15 border border-brand/25 text-brand',
              'hover:bg-brand/25 hover:border-brand/40',
              'disabled:opacity-35 disabled:cursor-not-allowed',
            )}
          >
            {isPending
              ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
              : <><Play size={13} fill="currentColor" /> Analyze Script</>
            }
          </button>
        </div>

        {/* ── Right: Results ── */}
        <div className="flex flex-col w-1/2 min-h-0 gap-3">

          {/* Tab bar */}
          <div className={cn(
            'flex items-center gap-1 p-1 rounded-xl border flex-shrink-0',
            'bg-gradient-to-br from-surface-2 to-surface-2/60',
            'border-border/60',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.25)]',
          )}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex-1 justify-center transition-all duration-150 border',
                  activeTab === tab.id
                    ? [
                        'bg-surface-3 text-white border-border/80',
                        'shadow-[0_2px_8px_rgba(0,0,0,0.35),0_0_0_1px_rgba(118,185,0,0.14),0_0_12px_rgba(118,185,0,0.08)]',
                      ]
                    : 'text-neutral-500 border-transparent hover:text-neutral-200 hover:bg-surface-3/30',
                )}
              >
                <tab.icon size={10} className={cn('flex-shrink-0', activeTab === tab.id && 'text-brand')} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== undefined && result && (
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-px rounded-full leading-none',
                    tab.id === 'errors' && tab.count > 0
                      ? 'bg-accent-red/15 text-accent-red'
                      : 'bg-surface-3/80 text-neutral-500',
                  )}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-brand/60" />
                )}
              </button>
            ))}
          </div>

          {/* Results content */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border bg-surface-1">

            {/* Empty state */}
            {!result && !isPending && !error && (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
                  <Terminal size={22} className="text-neutral-400" />
                </div>
                <div>
                  <p className="text-[13px] text-neutral-400 font-medium">Ready to analyze</p>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Paste a script on the left and click<br />
                    <span className="text-neutral-500">Analyze Script</span> to get started
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1"><Bug size={10} /> Errors</span>
                  <ChevronRight size={10} />
                  <span className="flex items-center gap-1"><Zap size={10} /> Enhancements</span>
                  <ChevronRight size={10} />
                  <span className="flex items-center gap-1"><Code2 size={10} /> Fixed Script</span>
                </div>
              </div>
            )}

            {/* Loading */}
            {isPending && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 size={22} className="text-brand animate-spin" />
                <p className="text-[12px] text-neutral-500">Analyzing your script with Claude…</p>
              </div>
            )}

            {/* Error */}
            {error && !isPending && (
              <div className="m-4 p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 flex items-start gap-3">
                <AlertCircle size={15} className="text-accent-red flex-shrink-0 mt-px" />
                <div>
                  <p className="text-[13px] text-accent-red font-medium">Analysis failed</p>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">{(error as Error).message}</p>
                </div>
              </div>
            )}

            {/* Results */}
            {result && !isPending && (
              <div className="p-4 space-y-3">

                {/* Errors tab */}
                {activeTab === 'errors' && (
                  <>
                    {result.errors.length === 0 ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-brand/[.08] border border-brand/20">
                        <CheckCircle2 size={15} className="text-brand flex-shrink-0" />
                        <div>
                          <p className="text-[13px] text-brand font-medium">No errors found</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">The script looks clean</p>
                        </div>
                      </div>
                    ) : (
                      result.errors.map((err, i) => (
                        <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-border">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-[12.5px] text-white font-semibold leading-snug">{err.title}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {err.line !== null && (
                                <span className="text-[10px] font-mono text-neutral-500 bg-surface-3 border border-border px-1.5 py-px rounded">
                                  :{err.line}
                                </span>
                              )}
                              <span className={cn('text-[9.5px] font-bold px-1.5 py-px rounded uppercase tracking-wide', SEVERITY[err.severity].cls)}>
                                {SEVERITY[err.severity].label}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11.5px] text-neutral-400 leading-relaxed">{err.description}</p>
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Enhancements tab */}
                {activeTab === 'enhancements' && (
                  <>
                    {result.enhancements.length === 0 ? (
                      <p className="text-[12px] text-neutral-500 p-2">No enhancements suggested.</p>
                    ) : (
                      result.enhancements.map((enh, i) => (
                        <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-border">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Lightbulb size={11} className="text-yellow-400 flex-shrink-0" />
                            <p className="text-[12.5px] text-white font-semibold">{enh.title}</p>
                          </div>
                          <p className="text-[11.5px] text-neutral-400 leading-relaxed">{enh.description}</p>
                          {enh.example && <ExampleBlock code={enh.example} />}
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Explanation tab */}
                {activeTab === 'explanation' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Info size={12} className="text-blue-400" />
                      <span className="text-[10.5px] font-semibold text-neutral-500 uppercase tracking-widest">
                        What this script does
                      </span>
                    </div>
                    <p className="text-[12.5px] text-neutral-300 leading-[1.85] whitespace-pre-wrap">
                      {result.explanation}
                    </p>
                  </div>
                )}

                {/* Fixed Script tab */}
                {activeTab === 'corrected' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Code2 size={12} className="text-brand" />
                        <span className="text-[10.5px] font-semibold text-neutral-500 uppercase tracking-widest">
                          Corrected Script
                        </span>
                      </div>
                      <button
                        onClick={() => copyText(result.corrected_script)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                          copied
                            ? 'border-brand/30 bg-brand/10 text-brand'
                            : 'border-border bg-surface-2 text-neutral-400 hover:text-white hover:border-neutral-600',
                        )}
                      >
                        {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="code-editor p-4 rounded-xl bg-[#0d0d0f] border border-border text-[12px] font-mono overflow-x-auto leading-[1.75] whitespace-pre">
                      {result.corrected_script}
                    </pre>
                  </div>
                )}

              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
