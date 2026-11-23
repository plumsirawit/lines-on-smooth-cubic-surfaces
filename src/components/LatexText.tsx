import katex from 'katex'
import { citationNumber } from '../references.ts'

interface LatexTextProps {
  source: string
  displayMode?: boolean
}

function renderMath(expression: string, displayMode: boolean) {
  return katex.renderToString(expression, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    output: 'html',
  })
}

const CITATION = /(\[@[^\]]+\])/g

/** Renders "[@a; @b, Thm. 2]" as linked "[1, 2, Thm. 2]"; a locator follows the last key. */
function Citation({ body }: { body: string }) {
  const items = body
    .slice(1, -1)
    .split(';')
    .map((part) => {
      const m = /^\s*@([\w-]+)\s*(?:,\s*(.+?))?\s*$/.exec(part)
      if (!m) throw new Error(`Malformed citation "${body}"`)
      return { id: m[1], locator: m[2] }
    })
  return (
    <span className="citation">
      [
      {items.map(({ id, locator }, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#ref-${id}`}>{citationNumber(id)}</a>
          {locator && `, ${locator}`}
        </span>
      ))}
      ]
    </span>
  )
}

function TextWithCitations({ text }: { text: string }) {
  const parts = text.split(CITATION)
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <Citation key={i} body={part} /> : part))}
    </>
  )
}

/**
 * Renders text with inline $…$ and display $$…$$ math (adapted from alg-geo-grinder),
 * plus citations written as [@key] or [@key, locator].
 */
export function LatexText({ source, displayMode = false }: LatexTextProps) {
  const mathPattern = /(\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+\$)/g
  const parts = source.split(mathPattern)

  return (
    <>
      {parts.map((part, index) => {
        const isMath = mathPattern.test(part)
        mathPattern.lastIndex = 0

        if (!isMath)
          return (
            <span key={index}>
              <TextWithCitations text={part} />
            </span>
          )

        const isDisplay = part.startsWith('$$')
        const expression = isDisplay ? part.slice(2, -2) : part.slice(1, -1)

        return (
          <span
            className={isDisplay ? 'display-math' : undefined}
            key={index}
            dangerouslySetInnerHTML={{ __html: renderMath(expression, isDisplay || displayMode) }}
          />
        )
      })}
    </>
  )
}
