import type { FloatTerm } from './poly.ts'

/**
 * Finds the 27 lines on a smooth cubic surface F(x, y, z, w) = 0 numerically.
 *
 * After a random orthogonal change of coordinates X = M·Y, a generic line is the span of
 *     u = (1, 0, a, b)   and   v = (0, 1, c, d)      (in Y-coordinates).
 * It lies on the surface iff G(s·u + t·v) ≡ 0, where G(Y) = F(M·Y); the four coefficients of
 * s^3, s^2 t, s t^2, t^3 give four cubic equations in (a, b, c, d). This system has exactly
 * 27 solutions when the surface is smooth and every line lies in the chart (true for generic M).
 *
 * We solve it with a total-degree homotopy (81 paths from z_k^3 = 1, with the "gamma trick"),
 * then polish, deduplicate and classify real solutions. If we do not find exactly 27 distinct
 * solutions we retry with a different random chart.
 */

export type Vec4 = [number, number, number, number]

export type LineResult = {
  /** Number of distinct lines found over C (27 when successful). */
  complexCount: number
  /** Real lines, each given by two real points of P^3 in (x, y, z, w) coordinates. */
  realLines: { p: Vec4; q: Vec4 }[]
  attempts: number
  ok: boolean
}

// --- Seeded PRNG so the same polynomial always gives the same result -------------------------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
}

function randomOrthogonal(rand: () => number): number[][] {
  const rows: number[][] = []
  while (rows.length < 4) {
    const v = [0, 1, 2, 3].map(() => gaussian(rand))
    for (const r of rows) {
      const dot = r.reduce((s, x, i) => s + x * v[i], 0)
      for (let i = 0; i < 4; i++) v[i] -= dot * r[i]
    }
    const n = Math.hypot(...v)
    if (n > 1e-6) rows.push(v.map((x) => x / n))
  }
  return rows
}

// --- Sparse float polynomials in 5 variables (a, b, c, d, t) for building the system ---------

type FPoly = Map<string, number>

function fmul(p: FPoly, q: FPoly): FPoly {
  const out: FPoly = new Map()
  for (const [kp, cp] of p) {
    const ep = kp.split(',').map(Number)
    for (const [kq, cq] of q) {
      const eq = kq.split(',').map(Number)
      const k = ep.map((e, i) => e + eq[i]).join(',')
      out.set(k, (out.get(k) ?? 0) + cp * cq)
    }
  }
  return out
}

/** Builds the four equations P_k(a, b, c, d), as term lists, for the chart given by M. */
function buildSystem(F: FloatTerm[], M: number[][]): CompiledSystem {
  // Y = (1, t, a + c·t, b + d·t); variables ordered (a, b, c, d, t).
  const Y: FPoly[] = [
    new Map([['0,0,0,0,0', 1]]),
    new Map([['0,0,0,0,1', 1]]),
    new Map([['1,0,0,0,0', 1], ['0,0,1,0,1', 1]]),
    new Map([['0,1,0,0,0', 1], ['0,0,0,1,1', 1]]),
  ]
  // X_i = Σ_j M[i][j] Y_j
  const X: FPoly[] = M.map((row) => {
    const out: FPoly = new Map()
    row.forEach((m, j) => {
      for (const [k, c] of Y[j]) out.set(k, (out.get(k) ?? 0) + m * c)
    })
    return out
  })
  const powCache = new Map<string, FPoly>()
  const xpow = (i: number, e: number): FPoly => {
    const k = `${i}^${e}`
    let r = powCache.get(k)
    if (!r) {
      r = e === 0 ? new Map([['0,0,0,0,0', 1]]) : fmul(xpow(i, e - 1), X[i])
      powCache.set(k, r)
    }
    return r
  }
  const total: FPoly = new Map()
  for (const [c, ...e] of F) {
    let term: FPoly = new Map([['0,0,0,0,0', c]])
    for (let i = 0; i < 4; i++) if (e[i] > 0) term = fmul(term, xpow(i, e[i]))
    for (const [k, v] of term) total.set(k, (total.get(k) ?? 0) + v)
  }
  // Split by the power of t.
  const eqs: { coef: number[]; ex: number[] }[] = [0, 1, 2, 3].map(() => ({ coef: [], ex: [] }))
  let scale = 0
  for (const v of total.values()) scale = Math.max(scale, Math.abs(v))
  for (const [k, v] of total) {
    if (Math.abs(v) <= 1e-14 * scale) continue
    const e = k.split(',').map(Number)
    eqs[e[4]].coef.push(v / scale)
    eqs[e[4]].ex.push(e[0], e[1], e[2], e[3])
  }
  return eqs.map((q) => ({ coef: Float64Array.from(q.coef), ex: Uint8Array.from(q.ex) }))
}

type CompiledSystem = { coef: Float64Array; ex: Uint8Array }[]

// --- Complex evaluation -----------------------------------------------------------------------
// Complex vectors are Float64Arrays of interleaved (re, im). A 4×4 Jacobian is 32 numbers.

const powRe = new Float64Array(16)
const powIm = new Float64Array(16)

function computePowers(z: Float64Array) {
  for (let j = 0; j < 4; j++) {
    const zr = z[2 * j]
    const zi = z[2 * j + 1]
    let r = 1
    let i = 0
    for (let e = 0; e < 4; e++) {
      powRe[j * 4 + e] = r
      powIm[j * 4 + e] = i
      const nr = r * zr - i * zi
      i = r * zi + i * zr
      r = nr
    }
  }
}

/** Evaluates the target system P at z into val (8) and its Jacobian into jac (32). */
function evalSystem(sys: CompiledSystem, z: Float64Array, val: Float64Array, jac: Float64Array) {
  computePowers(z)
  val.fill(0)
  jac.fill(0)
  for (let k = 0; k < 4; k++) {
    const { coef, ex } = sys[k]
    for (let t = 0; t < coef.length; t++) {
      const c = coef[t]
      const e0 = ex[4 * t], e1 = ex[4 * t + 1], e2 = ex[4 * t + 2], e3 = ex[4 * t + 3]
      const es = [e0, e1, e2, e3]
      // full product
      let pr = c
      let pi = 0
      for (let j = 0; j < 4; j++) {
        const ar = powRe[j * 4 + es[j]]
        const ai = powIm[j * 4 + es[j]]
        const nr = pr * ar - pi * ai
        pi = pr * ai + pi * ar
        pr = nr
      }
      val[2 * k] += pr
      val[2 * k + 1] += pi
      // partial derivatives
      for (let j = 0; j < 4; j++) {
        if (es[j] === 0) continue
        let dr = c * es[j]
        let di = 0
        for (let l = 0; l < 4; l++) {
          const e = l === j ? es[l] - 1 : es[l]
          if (e === 0) continue
          const ar = powRe[l * 4 + e]
          const ai = powIm[l * 4 + e]
          const nr = dr * ar - di * ai
          di = dr * ai + di * ar
          dr = nr
        }
        jac[2 * (k * 4 + j)] += dr
        jac[2 * (k * 4 + j) + 1] += di
      }
    }
  }
}

/** Solves the complex 4×4 system A x = b (A is overwritten). Returns false if singular. */
function solve4(A: Float64Array, b: Float64Array, x: Float64Array): boolean {
  const n = 4
  const rhs = Float64Array.from(b)
  for (let col = 0; col < n; col++) {
    let piv = col
    let best = -1
    for (let r = col; r < n; r++) {
      const m = Math.hypot(A[2 * (r * n + col)], A[2 * (r * n + col) + 1])
      if (m > best) {
        best = m
        piv = r
      }
    }
    if (best < 1e-300) return false
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        for (let h = 0; h < 2; h++) {
          const t = A[2 * (col * n + c) + h]
          A[2 * (col * n + c) + h] = A[2 * (piv * n + c) + h]
          A[2 * (piv * n + c) + h] = t
        }
      }
      for (let h = 0; h < 2; h++) {
        const t = rhs[2 * col + h]
        rhs[2 * col + h] = rhs[2 * piv + h]
        rhs[2 * piv + h] = t
      }
    }
    const pr = A[2 * (col * n + col)]
    const pi = A[2 * (col * n + col) + 1]
    const den = pr * pr + pi * pi
    for (let r = col + 1; r < n; r++) {
      const ar = A[2 * (r * n + col)]
      const ai = A[2 * (r * n + col) + 1]
      // f = a / p
      const fr = (ar * pr + ai * pi) / den
      const fi = (ai * pr - ar * pi) / den
      for (let c = col; c < n; c++) {
        const br = A[2 * (col * n + c)]
        const bi = A[2 * (col * n + c) + 1]
        A[2 * (r * n + c)] -= fr * br - fi * bi
        A[2 * (r * n + c) + 1] -= fr * bi + fi * br
      }
      const br = rhs[2 * col]
      const bi = rhs[2 * col + 1]
      rhs[2 * r] -= fr * br - fi * bi
      rhs[2 * r + 1] -= fr * bi + fi * br
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sr = rhs[2 * r]
    let si = rhs[2 * r + 1]
    for (let c = r + 1; c < n; c++) {
      const ar = A[2 * (r * n + c)]
      const ai = A[2 * (r * n + c) + 1]
      sr -= ar * x[2 * c] - ai * x[2 * c + 1]
      si -= ar * x[2 * c + 1] + ai * x[2 * c]
    }
    const pr = A[2 * (r * n + r)]
    const pi = A[2 * (r * n + r) + 1]
    const den = pr * pr + pi * pi
    x[2 * r] = (sr * pr + si * pi) / den
    x[2 * r + 1] = (si * pr - sr * pi) / den
  }
  return true
}

const norm = (z: Float64Array) => {
  let s = 0
  for (let i = 0; i < z.length; i++) s += z[i] * z[i]
  return Math.sqrt(s)
}

// --- Homotopy H(z, s) = (1 - s)·γ·Q(z) + s·P(z), Q_k(z) = z_k^3 - 1 ---------------------------

class Tracker {
  private readonly val = new Float64Array(8)
  private readonly jac = new Float64Array(32)
  private readonly H = new Float64Array(8)
  private readonly Hz = new Float64Array(32)
  private readonly Hs = new Float64Array(8)
  private readonly sys: CompiledSystem
  private readonly gr: number
  private readonly gi: number

  constructor(sys: CompiledSystem, gr: number, gi: number) {
    this.sys = sys
    this.gr = gr
    this.gi = gi
  }

  /** Fills H, Hz, Hs at (z, s). */
  private evaluate(z: Float64Array, s: number) {
    const { val, jac, H, Hz, Hs, gr, gi } = this
    evalSystem(this.sys, z, val, jac)
    const a = 1 - s
    Hz.fill(0)
    for (let k = 0; k < 4; k++) {
      const zr = z[2 * k]
      const zi = z[2 * k + 1]
      const z2r = zr * zr - zi * zi
      const z2i = 2 * zr * zi
      const qr = z2r * zr - z2i * zi - 1
      const qi = z2r * zi + z2i * zr
      const gqr = gr * qr - gi * qi
      const gqi = gr * qi + gi * qr
      H[2 * k] = a * gqr + s * val[2 * k]
      H[2 * k + 1] = a * gqi + s * val[2 * k + 1]
      Hs[2 * k] = val[2 * k] - gqr
      Hs[2 * k + 1] = val[2 * k + 1] - gqi
      for (let j = 0; j < 4; j++) {
        Hz[2 * (k * 4 + j)] = s * jac[2 * (k * 4 + j)]
        Hz[2 * (k * 4 + j) + 1] = s * jac[2 * (k * 4 + j) + 1]
      }
      // d/dz_k of γ(z_k^3 - 1) = 3γ z_k^2
      Hz[2 * (k * 4 + k)] += a * 3 * (gr * z2r - gi * z2i)
      Hz[2 * (k * 4 + k) + 1] += a * 3 * (gr * z2i + gi * z2r)
    }
  }

  /** dz/ds = -Hz^{-1} Hs */
  private tangent(z: Float64Array, s: number, out: Float64Array): boolean {
    this.evaluate(z, s)
    if (!solve4(this.Hz, this.Hs, out)) return false
    for (let i = 0; i < 8; i++) out[i] = -out[i]
    return true
  }

  /** One Newton step at fixed s; returns the step norm or -1 on failure. */
  newton(z: Float64Array, s: number): number {
    this.evaluate(z, s)
    const dz = new Float64Array(8)
    if (!solve4(this.Hz, this.H, dz)) return -1
    for (let i = 0; i < 8; i++) z[i] -= dz[i]
    return norm(dz)
  }

  /** Tracks a path from s = 0 to s = 1. Returns the endpoint or null if it diverged/failed. */
  track(start: Float64Array): Float64Array | null {
    let z = Float64Array.from(start)
    let s = 0
    let h = 0.01
    let streak = 0
    const k1 = new Float64Array(8), k2 = new Float64Array(8), k3 = new Float64Array(8), k4 = new Float64Array(8)
    const tmp = new Float64Array(8)
    for (let step = 0; step < 20000 && s < 1; step++) {
      const hh = Math.min(h, 1 - s)
      let ok = this.tangent(z, s, k1)
      if (ok) {
        for (let i = 0; i < 8; i++) tmp[i] = z[i] + (hh / 2) * k1[i]
        ok = this.tangent(tmp, s + hh / 2, k2)
      }
      if (ok) {
        for (let i = 0; i < 8; i++) tmp[i] = z[i] + (hh / 2) * k2[i]
        ok = this.tangent(tmp, s + hh / 2, k3)
      }
      if (ok) {
        for (let i = 0; i < 8; i++) tmp[i] = z[i] + hh * k3[i]
        ok = this.tangent(tmp, s + hh, k4)
      }
      let accepted = false
      if (ok) {
        const zp = new Float64Array(8)
        for (let i = 0; i < 8; i++) zp[i] = z[i] + (hh / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
        const scale = 1 + norm(zp)
        for (let it = 0; it < 3; it++) {
          const d = this.newton(zp, s + hh)
          if (d < 0 || (it === 0 && d > 1e-2 * scale)) break
          if (d < 1e-9 * scale) {
            accepted = true
            break
          }
        }
        if (accepted) {
          z = zp
          s += hh
          if (++streak >= 3) {
            h = Math.min(h * 2, 0.05)
            streak = 0
          }
        }
      }
      if (!accepted) {
        h /= 2
        streak = 0
        if (h < 1e-14) return null
      }
      if (norm(z) > 1e7) return null
    }
    return s >= 1 ? z : null
  }
}

// --- Driver -----------------------------------------------------------------------------------

function residualScale(sys: CompiledSystem, z: Float64Array): number {
  const r = 1 + norm(z)
  let s = 0
  for (const { coef } of sys) for (const c of coef) s += Math.abs(c)
  return s * r * r * r
}

function attempt(F: FloatTerm[], seed: number): { lines: Float64Array[]; M: number[][] } {
  const rand = mulberry32(seed)
  const M = randomOrthogonal(rand)
  const sys = buildSystem(F, M)
  const theta = 2 * Math.PI * rand()
  const tracker = new Tracker(sys, Math.cos(theta), Math.sin(theta))
  const roots = [0, 1, 2].map((k) => [Math.cos((2 * Math.PI * k) / 3), Math.sin((2 * Math.PI * k) / 3)])

  const val = new Float64Array(8)
  const jac = new Float64Array(32)
  const found: Float64Array[] = []
  for (let idx = 0; idx < 81; idx++) {
    const start = new Float64Array(8)
    let r = idx
    for (let j = 0; j < 4; j++) {
      start[2 * j] = roots[r % 3][0]
      start[2 * j + 1] = roots[r % 3][1]
      r = Math.floor(r / 3)
    }
    const end = tracker.track(start)
    if (!end) continue
    // Polish on the target system with Newton (stagnation at round-off level is fine).
    let last = Infinity
    for (let it = 0; it < 20; it++) {
      last = tracker.newton(end, 1)
      if (last < 0 || last < 1e-14 * (1 + norm(end))) break
    }
    if (last < 0 || last > 1e-8 * (1 + norm(end)) || norm(end) > 1e6) continue
    evalSystem(sys, end, val, jac)
    if (norm(val) > 1e-9 * residualScale(sys, end)) continue
    const tol = 1e-6 * (1 + norm(end))
    const duplicate = found.some((f) => {
      let d = 0
      for (let i = 0; i < 8; i++) d += (f[i] - end[i]) ** 2
      return Math.sqrt(d) < tol
    })
    if (!duplicate) found.push(end)
  }
  return { lines: found, M }
}

/**
 * Diagonal scaling X_i = s_i X'_i that balances coefficient magnitudes of F (least squares on
 * log|c| + Σ e_i log s_i ≈ const). Badly scaled inputs such as 81x^3 + … + 1 otherwise make
 * the homotopy ill-conditioned.
 */
function equilibrate(F: FloatTerm[]): number[] {
  // Unknowns: log s_0..log s_3 and a global offset μ; rows: e_t · log s + μ = -log|c_t|.
  const rows = F.filter((t) => t[0] !== 0).map(([c, ...e]) => ({ a: [...e, 1], b: -Math.log(Math.abs(c)) }))
  const n = 5
  const A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0))
  for (const { a, b } of rows) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += a[i] * a[j]
      A[i][n] += a[i] * b
    }
  }
  for (let i = 0; i < n; i++) A[i][i] += 1e-3 // regularise: keep s_i = 1 for unconstrained variables
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    ;[A[col], A[piv]] = [A[piv], A[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = A[r][col] / A[col][col]
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c]
    }
  }
  return [0, 1, 2, 3].map((i) => Math.exp(Math.max(-30, Math.min(30, A[i][n] / A[i][i]))))
}

export function findLines(F: FloatTerm[], maxAttempts = 6): LineResult {
  const s = equilibrate(F)
  const scaled: FloatTerm[] = F.map(([c, ...e]) => [c * e.reduce((m, k, i) => m * s[i] ** k, 1), ...e] as FloatTerm)
  let best: { lines: Float64Array[]; M: number[][] } | null = null
  let attempts = 0
  for (let a = 0; a < maxAttempts; a++) {
    attempts++
    const result = attempt(scaled, 0x5eed + 7919 * a)
    if (!best || Math.abs(result.lines.length - 27) < Math.abs(best.lines.length - 27)) best = result
    if (result.lines.length === 27) break
  }
  const { lines, M } = best!
  const realLines: { p: Vec4; q: Vec4 }[] = []
  for (const z of lines) {
    const scale = 1 + norm(z)
    let maxIm = 0
    for (let j = 0; j < 4; j++) maxIm = Math.max(maxIm, Math.abs(z[2 * j + 1]))
    if (maxIm > 1e-6 * scale) continue
    const [a, b, c, d] = [z[0], z[2], z[4], z[6]]
    // X = diag(s) · M · Y
    const apply = (y: number[]): Vec4 => M.map((row, i) => s[i] * row.reduce((acc, m, j) => acc + m * y[j], 0)) as Vec4
    realLines.push({ p: apply([1, 0, a, b]), q: apply([0, 1, c, d]) })
  }
  return { complexCount: lines.length, realLines, attempts, ok: lines.length === 27 }
}

// --- Affine geometry of a projective line ------------------------------------------------------

export type AffineLine =
  | { kind: 'affine'; point: [number, number, number]; direction: [number, number, number] }
  | { kind: 'infinity' }

/** Converts the line through projective points p, q into point + t·direction in the chart w = 1. */
export function toAffine(p: Vec4, q: Vec4): AffineLine {
  const scale = Math.max(Math.hypot(...p), Math.hypot(...q))
  if (Math.abs(p[3]) < 1e-9 * scale && Math.abs(q[3]) < 1e-9 * scale) return { kind: 'infinity' }
  // Point with w = 1 from whichever generator has the larger w; direction = point at infinity.
  const base = Math.abs(p[3]) >= Math.abs(q[3]) ? p : q
  const A = [base[0] / base[3], base[1] / base[3], base[2] / base[3]]
  let D = [0, 1, 2].map((i) => q[3] * p[i] - p[3] * q[i])
  const n = Math.hypot(...D)
  D = D.map((x) => x / n)
  // Move the base point to the point of the line closest to the origin.
  const dot = A[0] * D[0] + A[1] * D[1] + A[2] * D[2]
  const point = [A[0] - dot * D[0], A[1] - dot * D[1], A[2] - dot * D[2]] as [number, number, number]
  // Canonical sign: first significant coordinate positive.
  const lead = D.find((x) => Math.abs(x) > 1e-9) ?? 1
  const direction = D.map((x) => (lead < 0 ? -x : x)) as [number, number, number]
  return { kind: 'affine', point, direction }
}

/** Clips point + t·direction to the cube [-h, h]^3. Returns the parameter interval or null. */
export function clipToBox(line: { point: number[]; direction: number[] }, h: number): [number, number] | null {
  let t0 = -Infinity
  let t1 = Infinity
  for (let i = 0; i < 3; i++) {
    const p = line.point[i]
    const d = line.direction[i]
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) > h) return null
      continue
    }
    let a = (-h - p) / d
    let b = (h - p) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
  }
  return t0 < t1 ? [t0, t1] : null
}
