import * as P from './poly.ts'
import type { Poly } from './poly.ts'
import { ParseError, parsePolynomial } from './parse.ts'

export type CubicAnalysis =
  | { ok: true; F: Poly; homogeneousInput: boolean }
  | { ok: false; error: string; position?: number }

/**
 * Parses user input and checks that it defines a smooth cubic surface in P^3.
 * Input without w is treated as an affine cubic f(x, y, z) and homogenised with w;
 * input with w must already be a homogeneous cubic F(x, y, z, w).
 */
export function analyzeCubic(src: string): CubicAnalysis {
  let poly: Poly
  try {
    poly = parsePolynomial(src)
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, position: e.position }
    throw e
  }
  if (poly.size === 0) return { ok: false, error: 'The polynomial is identically zero.' }

  const homogeneousInput = P.usesVariable(poly, 3)
  const deg = P.degree(poly)
  let F: Poly
  if (homogeneousInput) {
    if (!P.isHomogeneous(poly, deg)) {
      return { ok: false, error: 'A polynomial that uses w must be homogeneous (every term of degree 3).' }
    }
    if (deg !== 3) return { ok: false, error: `This is a homogeneous polynomial of degree ${deg}, not a cubic.` }
    F = poly
  } else {
    if (deg !== 3) return { ok: false, error: `This polynomial has degree ${deg}; a cubic surface needs degree exactly 3.` }
    F = P.homogenize(poly, 3)
  }

  if (!isSmooth(F)) {
    return {
      ok: false,
      error:
        'This cubic surface is singular. Smoothness is checked on the projective closure over ℂ, so the singular point may be complex or at infinity (w = 0).',
    }
  }
  return { ok: true, F, homogeneousInput }
}

// ---------------------------------------------------------------------------
// Smoothness test
//
// For a cubic form F in 4 variables (char 0 or char p > 3), the surface V(F) ⊂ P^3 is singular
// exactly when the partials F_x, F_y, F_z, F_w have a common projective zero (Euler's identity
// puts F in their ideal). Four quadrics have no common projective zero iff they form a regular
// sequence, iff the ideal they generate contains every monomial of degree 5 (Hilbert series
// (1 + t)^4 vanishes from degree 5 on). So:
//
//     smooth  <=>  the 80 × 56 Macaulay matrix {m · F_i : deg m = 3} has rank 56.
//
// We compute that rank modulo large primes. Rank mod p ≤ rank over Q, so full rank mod any prime
// proves smoothness. If F is smooth, only finitely many primes divide all maximal minors, so
// rank deficiency across several random large primes means F is singular (barring a
// vanishingly unlikely coincidence).
// ---------------------------------------------------------------------------

function monomials(degree: number): P.Exps[] {
  const out: P.Exps[] = []
  for (let a = degree; a >= 0; a--)
    for (let b = degree - a; b >= 0; b--)
      for (let c = degree - a - b; c >= 0; c--) out.push([a, b, c, degree - a - b - c])
  return out
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
  return true
}

/** Random primes below 2^26, so products of residues stay below 2^52 and are exact in doubles. */
function randomPrimes(count: number): number[] {
  const primes: number[] = []
  while (primes.length < count) {
    let n = (1 << 25) + Math.floor(Math.random() * (1 << 25))
    while (!isPrime(n)) n--
    if (!primes.includes(n)) primes.push(n)
  }
  return primes
}

function modInverse(a: number, p: number): number {
  let [r0, r1, s0, s1] = [a, p, 1, 0]
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1)
    ;[r0, r1] = [r1, r0 - q * r1]
    ;[s0, s1] = [s1, s0 - q * s1]
  }
  return ((s0 % p) + p) % p
}

/** Rank of a dense matrix over F_p (rows are modified in place). */
function rankModP(rows: number[][], p: number): number {
  const cols = rows[0]?.length ?? 0
  let rank = 0
  for (let c = 0; c < cols && rank < rows.length; c++) {
    let pivot = rank
    while (pivot < rows.length && rows[pivot][c] === 0) pivot++
    if (pivot === rows.length) continue
    ;[rows[rank], rows[pivot]] = [rows[pivot], rows[rank]]
    const inv = modInverse(rows[rank][c], p)
    const pr = rows[rank]
    for (let j = c; j < cols; j++) pr[j] = (pr[j] * inv) % p
    for (let i = rank + 1; i < rows.length; i++) {
      const f = rows[i][c]
      if (f === 0) continue
      const row = rows[i]
      for (let j = c; j < cols; j++) row[j] = (((row[j] - f * pr[j]) % p) + p) % p
    }
    rank++
  }
  return rank
}

export function isSmooth(F: Poly): boolean {
  if (!P.isHomogeneous(F, 3) || F.size === 0) return false
  const partials = [0, 1, 2, 3].map((i) => P.derivative(F, i))
  const multipliers = monomials(3)
  const targets = monomials(5)
  const column = new Map(targets.map((e, i) => [e.join(','), i]))

  for (const p of randomPrimes(4)) {
    const bp = BigInt(p)
    const reduce = (q: { n: bigint; d: bigint }): number | null => {
      const d = Number(((q.d % bp) + bp) % bp)
      if (d === 0) return null
      const n = Number(((q.n % bp) + bp) % bp)
      return (n * modInverse(d, p)) % p
    }
    const rows: number[][] = []
    let badPrime = false
    for (const G of partials) {
      const terms = [...G].map(([k, c]) => ({ e: P.exps(k), c: reduce(c) }))
      if (terms.some((t) => t.c === null)) {
        badPrime = true
        break
      }
      for (const m of multipliers) {
        const row = new Array<number>(targets.length).fill(0)
        for (const { e, c } of terms) {
          const col = column.get([e[0] + m[0], e[1] + m[1], e[2] + m[2], e[3] + m[3]].join(','))!
          row[col] = (row[col] + c!) % p
        }
        rows.push(row)
      }
    }
    if (badPrime) continue
    if (rankModP(rows, p) === targets.length) return true
  }
  return false
}
