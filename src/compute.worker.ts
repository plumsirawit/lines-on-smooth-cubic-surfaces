import type { FloatTerm } from './math/poly.ts'
import { findLines } from './math/lines.ts'
import type { LineResult } from './math/lines.ts'
import { buildMesh } from './math/mesh.ts'
import type { SurfaceMesh } from './math/mesh.ts'

export type WorkerRequest =
  | { id: number; type: 'lines'; terms: FloatTerm[] }
  | { id: number; type: 'mesh'; terms: FloatTerm[]; halfSize: number; resolution: number }

export type WorkerResponse =
  | { id: number; type: 'lines'; result: LineResult }
  | { id: number; type: 'mesh'; mesh: SurfaceMesh }
  | { id: number; type: 'error'; message: string }

// Minimal typing of the dedicated worker scope (the app's tsconfig uses the DOM lib).
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

ctx.onmessage = (event) => {
  const req = event.data
  try {
    if (req.type === 'lines') {
      ctx.postMessage({ id: req.id, type: 'lines', result: findLines(req.terms) } satisfies WorkerResponse)
    } else {
      const mesh = buildMesh(req.terms, req.halfSize, req.resolution)
      ctx.postMessage({ id: req.id, type: 'mesh', mesh } satisfies WorkerResponse, [
        mesh.positions.buffer,
        mesh.normals.buffer,
        mesh.indices.buffer,
      ])
    }
  } catch (e) {
    ctx.postMessage({ id: req.id, type: 'error', message: String(e) } satisfies WorkerResponse)
  }
}
