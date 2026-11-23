import type { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'

export function createDemoScene(scene: Scene) {
  const camera = new ArcRotateCamera('camera', Math.PI / 4, Math.PI / 3, 6, Vector3.Zero(), scene)
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true)
  new HemisphericLight('light', new Vector3(0, 1, 0), scene)
  CreateSphere('sphere', { diameter: 2, segments: 32 }, scene)
}
