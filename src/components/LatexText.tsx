import katex from 'katex'

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

/** Renders text with inline $…$ and display $$…$$ math (same component as alg-geo-grinder). */
export function LatexText({ source, displayMode = false }: LatexTextProps) {
  const mathPattern = /(\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+\$)/g
  const parts = source.split(mathPattern)

  return (
    <>
      {parts.map((part, index) => {
        const isMath = mathPattern.test(part)
        mathPattern.lastIndex = 0

        if (!isMath) return <span key={index}>{part}</span>

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
