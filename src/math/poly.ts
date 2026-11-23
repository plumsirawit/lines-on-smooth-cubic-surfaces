import * as Q from './rational.ts'
import type { Rational } from './rational.ts'

/** Variables are x, y, z, w (indices 0..3). */
export const VARS = ['x', 'y', 'z', 'w'] as const
export type Exps = readonly [number, number, number, number]

/** Sparse polynomial with exact rational coefficients, keyed by "a,b,c,d" exponent strings. */
export type Poly = ReadonlyMap<string, Rational>

const key = (e: Exps) => e.join(',')
export const exps = (k: string) => k.split(',').map(Number) as unknown as Exps
export const totalDegree = (e: Exps) => e[0] + e[1] + e[2] + e[3]

export function constant(c: Rational): Poly {
  return Q.isZero(c) ? new Map() : new Map([[key([0, 0, 0, 0]), c]])
}

export function variable(i: number): Poly {
  const e = [0, 0, 0, 0]
  e[i] = 1
  return new Map([[e.join(','), Q.ONE]])
}

function accumulate(out: Map<string, Rational>, k: string, c: Rational) {
  const prev = out.get(k)
  const next = prev ? Q.add(prev, c) : c
  if (Q.isZero(next)) out.delete(k)
  else out.set(k, next)
}

export function add(a: Poly, b: Poly): Poly {
  const out = new Map(a)
  for (const [k, c] of b) accumulate(out, k, c)
  return out
}

export function neg(a: Poly): Poly {
  return new Map([...a].map(([k, c]) => [k, Q.neg(c)]))
}

export const sub = (a: Poly, b: Poly) => add(a, neg(b))

export function scale(a: Poly, s: Rational): Poly {
  if (Q.isZero(s)) return new Map()
  return new Map([...a].map(([k, c]) => [k, Q.mul(c, s)]))
}

export function mul(a: Poly, b: Poly): Poly {
  const out = new Map<string, Rational>()
  for (const [ka, ca] of a) {
    const ea = exps(ka)
    for (const [kb, cb] of b) {
      const eb = exps(kb)
      accumulate(out, key([ea[0] + eb[0], ea[1] + eb[1], ea[2] + eb[2], ea[3] + eb[3]]), Q.mul(ca, cb))
    }
  }
  return out
}

export function pow(a: Poly, n: number): Poly {
  let result = constant(Q.ONE)
  for (let i = 0; i < n; i++) result = mul(result, a)
  return result
}

export function degree(a: Poly): number {
  let d = -Infinity
  for (const k of a.keys()) d = Math.max(d, totalDegree(exps(k)))
  return d
}

/** Returns the constant value if the polynomial is constant, otherwise null. */
export function asConstant(a: Poly): Rational | null {
  if (a.size === 0) return Q.ZERO
  if (a.size === 1) {
    const c = a.get('0,0,0,0')
    if (c) return c
  }
  return null
}

export function isHomogeneous(a: Poly, d: number): boolean {
  for (const k of a.keys()) if (totalDegree(exps(k)) !== d) return false
  return true
}

export function usesVariable(a: Poly, i: number): boolean {
  for (const k of a.keys()) if (exps(k)[i] > 0) return true
  return false
}

/** Homogenises with respect to w up to degree d. */
export function homogenize(a: Poly, d: number): Poly {
  const out = new Map<string, Rational>()
  for (const [k, c] of a) {
    const e = exps(k)
    out.set(key([e[0], e[1], e[2], e[3] + d - totalDegree(e)]), c)
  }
  return out
}

export function derivative(a: Poly, i: number): Poly {
  const out = new Map<string, Rational>()
  for (const [k, c] of a) {
    const e = [...exps(k)] as [number, number, number, number]
    if (e[i] === 0) continue
    const m = e[i]
    e[i] -= 1
    accumulate(out, key(e), Q.mul(c, Q.rat(m)))
  }
  return out
}

/** A plain-number term list for numerics: [coefficient, ex, ey, ez, ew]. */
export type FloatTerm = [number, number, number, number, number]

export function toFloatTerms(a: Poly): FloatTerm[] {
  return [...a].map(([k, c]) => [Q.toNumber(c), ...exps(k)])
}

/** LaTeX rendering, ordered by decreasing degree. */
export function formatLatex(a: Poly): string {
  if (a.size === 0) return '0'
  const terms = [...a]
    .map(([k, c]) => ({ e: exps(k), c }))
    .sort((p, q) => totalDegree(q.e) - totalDegree(p.e) || (key(q.e) > key(p.e) ? 1 : -1))
  let s = ''
  for (const { e, c } of terms) {
    const negative = c.n < 0n
    const absC = negative ? Q.neg(c) : c
    const mono = e.map((p, i) => (p === 0 ? '' : p === 1 ? VARS[i] : `${VARS[i]}^{${p}}`)).join('')
    const isOne = absC.n === 1n && absC.d === 1n
    const coef = absC.d === 1n ? absC.n.toString() : `\\tfrac{${absC.n}}{${absC.d}}`
    const body = mono ? (isOne ? mono : `${coef}${mono}`) : coef
    s += s === '' ? (negative ? `-${body}` : body) : negative ? ` - ${body}` : ` + ${body}`
  }
  return s
}

/** Pretty-prints with ASCII operators, ordered by decreasing degree. */
export function format(a: Poly): string {
  if (a.size === 0) return '0'
  const terms = [...a]
    .map(([k, c]) => ({ e: exps(k), c }))
    .sort((p, q) => totalDegree(q.e) - totalDegree(p.e) || (key(q.e) > key(p.e) ? 1 : -1))
  let s = ''
  for (const { e, c } of terms) {
    const negative = c.n < 0n
    const absC = negative ? Q.neg(c) : c
    const mono = e
      .map((p, i) => (p === 0 ? '' : p === 1 ? VARS[i] : `${VARS[i]}^${p}`))
      .filter(Boolean)
      .join('*')
    const isOne = absC.n === 1n && absC.d === 1n
    const body = mono ? (isOne ? mono : `${Q.toString(absC)}*${mono}`) : Q.toString(absC)
    s += s === '' ? (negative ? `-${body}` : body) : negative ? ` - ${body}` : ` + ${body}`
  }
  return s
}
