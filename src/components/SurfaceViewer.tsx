import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder'
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { SurfaceMesh } from '../math/mesh.ts'

export type Segment = { start: [number, number, number]; end: [number, number, number]; color: string }

type Props = {
  mesh: SurfaceMesh | null
  segments: Segment[]
  halfSize: number
  showSurface: boolean
  translucent: boolean
}

/** Maths uses right-handed z-up; Babylon is left-handed y-up. Swapping y and z maps one to the other. */
const toWorld = ([x, y, z]: readonly number[]) => new Vector3(x, z, y)

function swapYZ(a: Float32Array): Float32Array {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i += 3) {
    out[i] = a[i]
    out[i + 1] = a[i + 2]
    out[i + 2] = a[i + 1]
  }
  return out
}

/**
 * The worker winds triangles consistently with the gradient normal. Babylon's lighting needs the
 * winding to match its own front-face convention, so compare against VertexData.ComputeNormals on
 * one triangle and flip every triangle if they disagree.
 */
function orientIndices(positions: Float32Array, normals: Float32Array, indices: Uint32Array): Uint32Array {
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]]
    const pos = tri.flatMap((i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]])
    const computed: number[] = []
    VertexData.ComputeNormals(pos, [0, 1, 2], computed)
    const ours = tri.reduce((acc, i) => acc.map((v, c) => v + normals[3 * i + c]), [0, 0, 0])
    const dot = computed[0] * ours[0] + computed[1] * ours[1] + computed[2] * ours[2]
    if (Math.abs(dot) < 1e-3) continue // degenerate triangle; try the next one
    if (dot > 0) return indices
    const flipped = new Uint32Array(indices.length)
    for (let k = 0; k < indices.length; k += 3) {
      flipped[k] = indices[k]
      flipped[k + 1] = indices[k + 2]
      flipped[k + 2] = indices[k + 1]
    }
    return flipped
  }
  return indices
}

export function SurfaceViewer({ mesh, segments, halfSize, showSurface, translucent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const surfaceRef = useRef<Mesh | null>(null)
  // On touch screens the canvas would otherwise swallow page scrolling, so the camera only
  // takes touch input after the user taps "rotate and zoom"; mouse users get it immediately.
  const [touchDevice] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const [interactive, setInteractive] = useState(!touchDevice)

  // Engine, scene, camera and lights: created once.
  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.97, 0.97, 0.97, 1)
    const camera = new ArcRotateCamera('camera', -Math.PI / 3, Math.PI / 2.8, 10, Vector3.Zero(), scene)
    camera.minZ = 0.01
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.55
    hemi.groundColor = new Color3(0.5, 0.5, 0.55)
    const key = new DirectionalLight('key', new Vector3(-0.5, -1, 0.7), scene)
    key.intensity = 0.65
    // Keep the key light pointing roughly along the view so the visible side is always lit.
    scene.onBeforeRenderObservable.add(() => {
      key.direction = camera.target.subtract(camera.position).normalize().add(new Vector3(0, -0.4, 0))
    })
    sceneRef.current = scene
    cameraRef.current = camera
    engine.runRenderLoop(() => scene.render())
    const observer = new ResizeObserver(() => engine.resize())
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      scene.dispose()
      engine.dispose()
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [])

  // Attach or release camera controls.
  useEffect(() => {
    const camera = cameraRef.current
    if (!camera || !interactive) return
    camera.attachControl(canvasRef.current, true)
    return () => camera.detachControl()
  }, [interactive])

  // Camera distance and bounding box follow the view size.
  useEffect(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return
    camera.radius = halfSize * 4.2
    camera.lowerRadiusLimit = halfSize * 0.5
    camera.upperRadiusLimit = halfSize * 20
    camera.wheelDeltaPercentage = 0.01
    camera.panningSensibility = 1000 / halfSize
    const h = halfSize
    const c = [-h, h]
    const edges: Vector3[][] = []
    for (const a of c)
      for (const b of c) {
        edges.push([toWorld([-h, a, b]), toWorld([h, a, b])])
        edges.push([toWorld([a, -h, b]), toWorld([a, h, b])])
        edges.push([toWorld([a, b, -h]), toWorld([a, b, h])])
      }
    const box = CreateLineSystem('box', { lines: edges }, scene)
    box.color = new Color3(0.55, 0.55, 0.55)
    const axes = CreateLineSystem(
      'axes',
      { lines: [0, 1, 2].map((i) => [toWorld([0, 0, 0]), toWorld([0, 1, 2].map((j) => (j === i ? h * 0.25 : 0)))]) },
      scene,
    )
    axes.color = new Color3(0.3, 0.3, 0.3)
    return () => {
      box.dispose()
      axes.dispose()
    }
  }, [halfSize])

  // Surface mesh.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !mesh || mesh.indices.length === 0) return
    const positions = swapYZ(mesh.positions)
    const normals = swapYZ(mesh.normals)
    const data = new VertexData()
    data.positions = positions
    data.normals = normals
    data.indices = orientIndices(positions, normals, mesh.indices)
    const surface = new Mesh('surface', scene)
    data.applyToMesh(surface)
    const material = new StandardMaterial('surfaceMaterial', scene)
    material.diffuseColor = Color3.FromHexString('#c9b38c')
    material.emissiveColor = material.diffuseColor.scale(0.22) // lift faces seen edge-on
    material.specularColor = new Color3(0.15, 0.15, 0.15)
    material.backFaceCulling = false
    material.twoSidedLighting = true
    surface.material = material
    surfaceRef.current = surface
    return () => {
      surface.dispose(false, true)
      surfaceRef.current = null
    }
  }, [mesh])

  // Surface visibility / translucency.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    surface.setEnabled(showSurface)
    const material = surface.material as StandardMaterial
    material.alpha = translucent ? 0.45 : 1
  }, [mesh, showSurface, translucent])

  // Lines as tubes.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const tubes = segments.map((s, i) => {
      const tube = CreateTube(
        `line${i}`,
        { path: [toWorld(s.start), toWorld(s.end)], radius: halfSize * 0.011, tessellation: 10, cap: Mesh.CAP_ALL },
        scene,
      )
      const material = new StandardMaterial(`lineMaterial${i}`, scene)
      const color = Color3.FromHexString(s.color)
      material.diffuseColor = color
      material.emissiveColor = color.scale(0.45)
      material.specularColor = new Color3(0.2, 0.2, 0.2)
      tube.material = material
      return tube
    })
    return () => tubes.forEach((t) => t.dispose(false, true))
  }, [segments, halfSize])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={interactive ? 'viewer-canvas interactive' : 'viewer-canvas'}
        aria-label="3D view of the cubic surface and its real lines"
      />
      {touchDevice &&
        (interactive ? (
          <button type="button" className="viewer-toggle done" onClick={() => setInteractive(false)}>
            Done
          </button>
        ) : (
          <button type="button" className="viewer-toggle" onClick={() => setInteractive(true)}>
            Tap to rotate and zoom
          </button>
        ))}
    </>
  )
}
