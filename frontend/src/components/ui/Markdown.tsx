import ReactMarkdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import hcl from 'react-syntax-highlighter/dist/esm/languages/prism/hcl'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'

// Register only the languages the guidance actually uses — keeps the bundle small.
for (const [name, lang] of [
  ['bash', bash], ['sh', bash], ['shell', bash],
  ['yaml', yaml], ['yml', yaml],
  ['hcl', hcl], ['terraform', hcl], ['tf', hcl],
  ['json', json], ['python', python], ['py', python],
] as const) {
  SyntaxHighlighter.registerLanguage(name, lang as never)
}

/**
 * Renders a markdown string with real headings/lists and syntax-highlighted,
 * per-language code blocks (bash / yaml / terraform / json). Replaces the old
 * habit of dumping raw markdown into a <pre>, where fences showed literally.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div
      className="text-[12px] leading-6 text-gray-200 [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-1 [&_h1]:mb-2 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:text-gray-100 [&_p]:my-1.5 [&_a]:text-brand [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:text-white"
    >
      <ReactMarkdown
        components={{
          // SyntaxHighlighter emits its own container (PreTag="div"); don't let
          // react-markdown wrap it in an extra <pre>.
          pre: ({ children }) => <>{children}</>,
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, '')
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = Boolean(match) || text.includes('\n')

            if (!isBlock) {
              return (
                <code
                  className="bg-surface-2 text-brand rounded px-1 py-0.5 text-[11px] font-mono"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <SyntaxHighlighter
                language={match?.[1]?.toLowerCase() || 'text'}
                style={oneDark}
                PreTag="div"
                customStyle={{
                  margin: '0.5rem 0',
                  borderRadius: 8,
                  fontSize: 11.5,
                  background: '#0d1117',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, monospace' } }}
              >
                {text}
              </SyntaxHighlighter>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
