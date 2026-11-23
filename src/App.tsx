import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { analyzeCubic } from './math/cubic.ts'
import type { CubicAnalysis } from './math/cubic.ts'
import { clipToBox, toAffine } from './math/lines.ts'
import type { AffineLine, Vec4 } from './math/lines.ts'
import * as P from './math/poly.ts'
import { useLines, useMesh } from './useCompute.ts'
import { LatexText } from './components/LatexText.tsx'
import { SurfaceViewer } from './components/SurfaceViewer.tsx'
import { References } from './components/References.tsx'
import type { Segment } from './components/SurfaceViewer.tsx'
import './App.css'

const PRESETS = [
  {
    label: 'Clebsch diagonal surface',
    hint: '27 real',
    src: '81(x^3 + y^3 + z^3) - 189(x^2y + x^2z + xy^2 + y^2z + xz^2 + yz^2) + 54xyz + 126(xy + yz + zx) - 9(x^2 + y^2 + z^2) - 9(x + y + z) + 1',
    halfSize: 1,
  },
  { label: 'Clebsch, homogeneous form', hint: '27 real', src: 'x^3 + y^3 + z^3 + w^3 = (x + y + z + w)^3', halfSize: 4 },
  { label: 'Sum of cubes minus a plane', hint: '15 real', src: 'x^3 + y^3 + z^3 = x + y + z', halfSize: 2 },
  { label: 'A less symmetric cubic', hint: '7 real', src: 'x^3 + y^3 + z^3 + 2xy = y + z', halfSize: 2 },
  { label: 'Fermat cubic', hint: '3 real', src: 'x^3 + y^3 + z^3 = 1', halfSize: 2 },
  { label: "Cayley's nodal cubic", hint: 'singular', src: 'xyz + xyw + xzw + yzw', halfSize: 2 },
]

const RESOLUTIONS = [
  { label: 'Draft', value: 60 },
  { label: 'Normal', value: 100 },
  { label: 'Fine', value: 150 },
]

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const lineColor = (i: number) => hslToHex((i * 137.508 + 210) % 360, 0.75, 0.42)

const fmt = (x: number) => {
  const s = x.toFixed(3)
  return s === '-0.000' ? '0.000' : s
}

type RealLine = { index: number; color: string; affine: AffineLine; p: Vec4; q: Vec4 }

function App() {
  const [input, setInput] = useState(PRESETS[0].src)
  const [analysis, setAnalysis] = useState<{ src: string; result: CubicAnalysis }>(() => ({
    src: PRESETS[0].src,
    result: analyzeCubic(PRESETS[0].src),
  }))
  const [halfSize, setHalfSize] = useState(PRESETS[0].halfSize)
  const [meshHalfSize, setMeshHalfSize] = useState(PRESETS[0].halfSize)
  const [resolution, setResolution] = useState(100)
  const [showSurface, setShowSurface] = useState(true)
  const [translucent, setTranslucent] = useState(false)

  // Re-mesh shortly after the slider settles rather than on every tick.
  useEffect(() => {
    const t = setTimeout(() => setMeshHalfSize(halfSize), 250)
    return () => clearTimeout(t)
  }, [halfSize])

  const result = analysis.result
  const terms = useMemo(() => (result.ok ? P.toFloatTerms(result.F) : null), [result])
  const linesJob = useLines(terms)
  const meshJob = useMesh(terms, meshHalfSize, resolution)

  const realLines: RealLine[] = useMemo(() => {
    if (linesJob.status !== 'done') return []
    const lines = linesJob.value.realLines.map(({ p, q }) => ({ p, q, affine: toAffine(p, q) }))
    // Stable, readable order: affine lines by distance to the origin, lines at infinity last.
    const dist = (l: AffineLine) => (l.kind === 'affine' ? Math.hypot(...l.point) : Infinity)
    lines.sort((a, b) => dist(a.affine) - dist(b.affine))
    return lines.map((l, index) => ({ ...l, index, color: lineColor(index) }))
  }, [linesJob])

  const segments: Segment[] = useMemo(() => {
    const out: Segment[] = []
    for (const line of realLines) {
      if (line.affine.kind !== 'affine') continue
      const range = clipToBox(line.affine, halfSize)
      if (!range) continue
      const { point, direction } = line.affine
      const at = (t: number) => point.map((p, i) => p + t * direction[i]) as [number, number, number]
      out.push({ start: at(range[0]), end: at(range[1]), color: line.color })
    }
    return out
  }, [realLines, halfSize])

  const atInfinity = realLines.filter((l) => l.affine.kind === 'infinity').length

  const draw = (src: string, newHalfSize?: number) => {
    setAnalysis({ src, result: analyzeCubic(src) })
    if (newHalfSize !== undefined) {
      setHalfSize(newHalfSize)
      setMeshHalfSize(newHalfSize)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    draw(input)
  }

  return (
    <div className="page">
      <header className="page-header">
        <a className="site-title" href="./">
          Lines on Smooth Cubic Surfaces
        </a>
        <a className="header-link" href="https://github.com/plumsirawit/lines-on-smooth-cublic-surfaces">
          Source on GitHub
        </a>
      </header>

      <main className="content">
        <section className="intro">
          <h1>The 27 lines</h1>
          <p>
            <LatexText source="A cubic surface is the zero set $S = V(F) \subset \mathbb{P}^3$ of a homogeneous polynomial $F(x, y, z, w)$ of degree $3$. In 1849 Cayley and Salmon proved that every smooth cubic surface over $\mathbb{C}$ contains exactly $27$ straight lines, no matter which smooth cubic you pick [@cayley1849; @salmon1849]. Singular cubics have fewer: Cayley's nodal cubic below has only $9$ [@cayley1869]." />
          </p>
          <p>
            <LatexText source="The lines have a rigid configuration. Each line meets exactly $10$ of the others, and $S$ is the blow-up of $\mathbb{P}^2$ in six points in general position: the $27$ lines are the $6$ exceptional curves, the $15$ lines through two of the points, and the $6$ conics through five of them [@hartshorne, Ch. V, §4]. See also [@reid] for an elementary account and [@dolgachev, Ch. 9] for much more." />
          </p>
          <p>
            <LatexText source="Over $\mathbb{R}$ the picture is less uniform. Schläfli showed that a smooth real cubic surface contains exactly $27$, $15$, $7$ or $3$ real lines; the others come in complex-conjugate pairs [@schlafli1858; @segre]. On the Clebsch diagonal surface all $27$ are real [@clebsch1871]." />
          </p>
        </section>

        <hr />

        <section>
          <h2>Try a cubic</h2>
          <form className="cubic-form" onSubmit={onSubmit}>
            <label htmlFor="cubic-input">
              Polynomial in <var>x</var>, <var>y</var>, <var>z</var> (affine) or <var>x</var>, <var>y</var>, <var>z</var>,{' '}
              <var>w</var> (homogeneous)
            </label>
            <div className="input-row">
              <input
                id="cubic-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
              />
              <button className="primary-button" type="submit">
                Draw
              </button>
            </div>
            <p className="input-help">
              Use <code>+ - * / ^</code>, parentheses and implicit multiplication (<code>2xy</code>,{' '}
              <code>(x+1)(y-1)</code>); an equation like <code>x^3 + y^3 + z^3 = 1</code> also works.
            </p>
          </form>
          <div className="presets">
            <span>Examples:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="link-button"
                onClick={() => {
                  setInput(p.src)
                  draw(p.src, p.halfSize)
                }}
              >
                {p.label} <span className="preset-hint">({p.hint})</span>
              </button>
            ))}
          </div>

          {!result.ok && (
            <div className="notice-error" role="alert">
              <p>{result.error}</p>
              {result.position !== undefined && (
                <pre className="error-source">
                  {analysis.src.slice(0, result.position)}
                  <mark>{analysis.src[result.position] ?? ' '}</mark>
                  {analysis.src.slice(result.position + 1)}
                </pre>
              )}
            </div>
          )}

          <div className="workspace">
            <div className="viewer-pane">
              <div className="pane-heading">
                <span>
                  <LatexText source={`Real points with $w = 1$ in $[-${halfSize}, ${halfSize}]^3$`} />
                </span>
                <span>{meshJob.status === 'running' ? 'Meshing…' : 'Drag to rotate · scroll to zoom'}</span>
              </div>
              <div className="viewer">
                <SurfaceViewer
                  mesh={result.ok && meshJob.status === 'done' ? meshJob.value : null}
                  segments={result.ok ? segments : []}
                  halfSize={halfSize}
                  showSurface={showSurface}
                  translucent={translucent}
                />
              </div>
              <div className="viewer-controls">
                <label className="range-control">
                  Box half-width <strong>{halfSize}</strong>
                  <input
                    type="range"
                    min={0.5}
                    max={10}
                    step={0.25}
                    value={halfSize}
                    onChange={(e) => setHalfSize(Number(e.target.value))}
                  />
                </label>
                <label>
                  Mesh{' '}
                  <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
                    {RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={showSurface} onChange={(e) => setShowSurface(e.target.checked)} />{' '}
                  Surface
                </label>
                <label>
                  <input type="checkbox" checked={translucent} onChange={(e) => setTranslucent(e.target.checked)} />{' '}
                  Translucent
                </label>
              </div>
            </div>

            <aside className="results-pane">
              <div className="pane-heading">Results</div>
              <div className="results-body">
                {result.ok ? (
                  <>
                    <p className="equation">
                      <LatexText source={`$F = ${P.formatLatex(result.F)}$`} />
                    </p>
                    {!result.homogeneousInput && (
                      <p className="muted small">
                        <LatexText source="Homogenised from $f(x, y, z)$ as $F = w^3 f(x/w, y/w, z/w)$." />
                      </p>
                    )}
                    <p className="muted small">
                      <LatexText source="Smooth: the partial derivatives have no common zero in $\mathbb{P}^3(\mathbb{C})$." />
                    </p>
                    {linesJob.status === 'running' && <p>Finding lines…</p>}
                    {linesJob.status === 'error' && <p className="notice-error">{linesJob.message}</p>}
                    {linesJob.status === 'done' && (
                      <>
                        <table className="counts">
                          <tbody>
                            <tr>
                              <th>Lines over ℂ</th>
                              <td>{linesJob.value.complexCount}</td>
                            </tr>
                            <tr>
                              <th>Real lines</th>
                              <td>{realLines.length}</td>
                            </tr>
                            <tr>
                              <th>Real lines in the box</th>
                              <td>{segments.length}</td>
                            </tr>
                            {atInfinity > 0 && (
                              <tr>
                                <th>Real lines at infinity</th>
                                <td>{atInfinity}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        {!linesJob.value.ok && (
                          <p className="notice-error">
                            The numerical solver found {linesJob.value.complexCount} distinct lines instead of 27, so
                            the counts above may be incomplete. This can happen for nearly singular surfaces.
                          </p>
                        )}
                        {linesJob.value.ok && ![3, 7, 15, 27].includes(realLines.length) && (
                          <p className="notice-error">
                            {realLines.length} real lines contradicts Schläfli's theorem, so some lines were
                            misclassified numerically.
                          </p>
                        )}
                        <ol className="line-list">
                          {realLines.map((l) => (
                            <li key={l.index}>
                              <span className="swatch" style={{ background: l.color }} />
                              {l.affine.kind === 'affine' ? (
                                <code>
                                  ({l.affine.point.map(fmt).join(', ')}) + t({l.affine.direction.map(fmt).join(', ')})
                                </code>
                              ) : (
                                <span>
                                  at infinity, through <code>[{l.p.map(fmt).join(' : ')}]</code> and{' '}
                                  <code>[{l.q.map(fmt).join(' : ')}]</code>
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </>
                ) : (
                  <p className="muted">Enter a smooth cubic to see its lines.</p>
                )}
              </div>
            </aside>
          </div>
        </section>

        <hr />

        <section>
          <h2>How it works</h2>
          <ol className="how-list">
            <li>
              <LatexText source="Input without $w$ is an affine cubic $f(x, y, z)$ and is homogenised to $F = w^3 f(x/w, y/w, z/w)$. The picture shows the real points of the affine chart $w = 1$ near the origin." />
            </li>
            <li>
              <LatexText source="Smoothness is checked exactly over $\mathbb{C}$, including points at infinity. $S$ is singular iff $F_x, F_y, F_z, F_w$ have a common zero in $\mathbb{P}^3$. Four quadrics have no common zero iff they form a regular sequence, iff their ideal contains every monomial of degree $5$. So the page checks that the $80 \times 56$ matrix of products $m \cdot F_i$ (with $\deg m = 3$) has rank $56$, computing modulo large random primes. For regular sequences, Hilbert series and Macaulay matrices, see [@clo]." />
            </li>
            <li>
              <LatexText source="Lines: after a random orthogonal change of coordinates, almost every line is spanned by $(1, 0, a, b)$ and $(0, 1, c, d)$. The line lies on $S$ iff the four coefficients of $F(s\,u + t\,v)$ vanish: four cubic equations in $a, b, c, d$. These are solved by homotopy continuation, tracking $81$ paths from $a^3 = b^3 = c^3 = d^3 = 1$. Exactly $27$ paths converge to finite solutions; solutions with zero imaginary part are the real lines. The method (including the random complex constant that keeps paths apart) is described in [@sommese-wampler]." />
            </li>
            <li>
              <LatexText source="The surface is triangulated with marching tetrahedra [@doi-koide] on a grid over the box. Everything runs in your browser." />
            </li>
          </ol>
        </section>

        <hr />

        <section>
          <h2>References</h2>
          <References />
        </section>
      </main>

      <footer className="page-footer">
        Built with React, Vite, KaTeX, and Babylon.js. Vibe-coded with GitHub Copilot and Claude Code.
      </footer>
    </div>
  )
}

export default App
