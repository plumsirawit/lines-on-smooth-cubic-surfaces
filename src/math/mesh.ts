import type { FloatTerm } from './poly.ts'

export type SurfaceMesh = {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

/**
 * Triangulates the real affine surface f(x, y, z) = F(x, y, z, 1) = 0 inside the cube
 * [-h, h]^3 using marching tetrahedra (each grid cell split into 6 tetrahedra along its main
 * diagonal, which keeps neighbouring cells crack-free). Vertices on shared edges are welded,
 * normals are the analytic gradient, and every triangle is wound so that its geometric normal
 * agrees with the gradient, giving a consistent orientation across the whole mesh.
 */
export function buildMesh(F: FloatTerm[], h: number, resolution: number): SurfaceMesh {
  const n = resolution
  const N = n + 1
  const step = (2 * h) / n
  const coord = (i: number) => -h + i * step

  // Precompute coordinate powers per axis, then evaluate f on the grid.
  const terms = F.map(([c, ex, ey, ez]) => ({ c, ex, ey, ez }))
  const pw = (e: number) => Float64Array.from({ length: N }, (_, i) => coord(i) ** e)
  const powers = [0, 1, 2, 3].map(pw)
  const values = new Float64Array(N * N * N)
  let maxAbs = 0
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let v = 0
        for (const t of terms) v += t.c * powers[t.ex][i] * powers[t.ey][j] * powers[t.ez][k]
        values[i + N * (j + N * k)] = v
        maxAbs = Math.max(maxAbs, Math.abs(v))
      }
    }
  }
  // Nudge exact zeros so every edge has a strict sign change or none.
  const eps = 1e-12 * (maxAbs || 1)
  for (let i = 0; i < values.length; i++) if (values[i] === 0) values[i] = eps

  const grad = [0, 1, 2].map((axis) =>
    F.filter((t) => t[1 + axis] > 0).map(([c, ...e]) => {
      const d = [...e]
      const m = d[axis]
      d[axis] -= 1
      return { c: c * m, ex: d[0], ey: d[1], ez: d[2] }
    }),
  )
  const evalGrad = (x: number, y: number, z: number) =>
    grad.map((ts) => ts.reduce((s, t) => s + t.c * x ** t.ex * y ** t.ey * z ** t.ez, 0))

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const edgeCache = new Map<number, number>()
  const total = N * N * N

  const vertexOnEdge = (a: number, b: number): number => {
    const keyLo = Math.min(a, b)
    const keyHi = Math.max(a, b)
    const key = keyLo * total + keyHi
    const cached = edgeCache.get(key)
    if (cached !== undefined) return cached
    const fa = values[a]
    const fb = values[b]
    const t = fa / (fa - fb)
    const ai = a % N, aj = Math.floor(a / N) % N, ak = Math.floor(a / (N * N))
    const bi = b % N, bj = Math.floor(b / N) % N, bk = Math.floor(b / (N * N))
    const x = coord(ai + t * (bi - ai))
    const y = coord(aj + t * (bj - aj))
    const z = coord(ak + t * (bk - ak))
    const g = evalGrad(x, y, z)
    const len = Math.hypot(g[0], g[1], g[2]) || 1
    const index = positions.length / 3
    positions.push(x, y, z)
    normals.push(g[0] / len, g[1] / len, g[2] / len)
    edgeCache.set(key, index)
    return index
  }

  const emit = (i0: number, i1: number, i2: number) => {
    if (i0 === i1 || i1 === i2 || i0 === i2) return
    const p = (i: number, c: number) => positions[3 * i + c]
    const ux = p(i1, 0) - p(i0, 0), uy = p(i1, 1) - p(i0, 1), uz = p(i1, 2) - p(i0, 2)
    const vx = p(i2, 0) - p(i0, 0), vy = p(i2, 1) - p(i0, 1), vz = p(i2, 2) - p(i0, 2)
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    let dot = 0
    for (const i of [i0, i1, i2]) dot += cx * normals[3 * i] + cy * normals[3 * i + 1] + cz * normals[3 * i + 2]
    if (dot >= 0) indices.push(i0, i1, i2)
    else indices.push(i0, i2, i1)
  }

  // Cube corner c = (bit0: +x, bit1: +y, bit2: +z). Six tetrahedra: one per axis ordering.
  const tets = [
    [0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7],
  ]
  const corner = new Array<number>(8)
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let negatives = 0
        for (let c = 0; c < 8; c++) {
          corner[c] = i + (c & 1) + N * (j + ((c >> 1) & 1) + N * (k + ((c >> 2) & 1)))
          if (values[corner[c]] < 0) negatives++
        }
        if (negatives === 0 || negatives === 8) continue
        for (const tet of tets) {
          const v = tet.map((c) => corner[c])
          const inside = v.filter((idx) => values[idx] < 0)
          const outside = v.filter((idx) => values[idx] >= 0)
          if (inside.length === 0 || inside.length === 4) continue
          if (inside.length === 1 || inside.length === 3) {
            const [s] = inside.length === 1 ? inside : outside
            const others = inside.length === 1 ? outside : inside
            emit(vertexOnEdge(s, others[0]), vertexOnEdge(s, others[1]), vertexOnEdge(s, others[2]))
          } else {
            const [a, b] = inside
            const [c, d] = outside
            const ac = vertexOnEdge(a, c), ad = vertexOnEdge(a, d), bd = vertexOnEdge(b, d), bc = vertexOnEdge(b, c)
            emit(ac, ad, bd)
            emit(ac, bd, bc)
          }
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
  }
}
