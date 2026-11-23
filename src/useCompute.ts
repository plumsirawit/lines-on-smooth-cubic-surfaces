import { useEffect, useRef, useState } from 'react'
import type { FloatTerm } from './math/poly.ts'
import type { LineResult } from './math/lines.ts'
import type { SurfaceMesh } from './math/mesh.ts'
import type { WorkerRequest, WorkerResponse } from './compute.worker.ts'

export type Job<T> =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; value: T }
  | { status: 'error'; message: string }

type JobRequest = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never

/**
 * Runs one kind of job in a dedicated worker. A new request supersedes the previous one: the old
 * worker is terminated so a long computation never delays the latest input.
 */
function useWorkerJob<T>(request: JobRequest | null, pick: (r: WorkerResponse) => T | undefined): Job<T> {
  const [state, setState] = useState<{ key: string; job: Job<T> } | null>(null)
  const pickRef = useRef(pick)
  const key = request ? JSON.stringify(request) : null

  useEffect(() => {
    if (!key) return
    const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' })
    const finish = (job: Job<T>) => {
      setState({ key, job })
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data
      if (res.type === 'error') return finish({ status: 'error', message: res.message })
      const value = pickRef.current(res)
      if (value !== undefined) finish({ status: 'done', value })
    }
    worker.onerror = (event) => finish({ status: 'error', message: event.message || 'Worker failed' })
    worker.postMessage({ ...JSON.parse(key), id: 0 } as WorkerRequest)
    return () => worker.terminate()
  }, [key])

  if (!key) return { status: 'idle' }
  if (!state || state.key !== key) return { status: 'running' }
  return state.job
}

export function useLines(terms: FloatTerm[] | null): Job<LineResult> {
  return useWorkerJob(terms ? { type: 'lines', terms } : null, (r) => (r.type === 'lines' ? r.result : undefined))
}

export function useMesh(terms: FloatTerm[] | null, halfSize: number, resolution: number): Job<SurfaceMesh> {
  return useWorkerJob(terms ? { type: 'mesh', terms, halfSize, resolution } : null, (r) =>
    r.type === 'mesh' ? r.mesh : undefined,
  )
}
