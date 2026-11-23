import { BabylonCanvas } from './BabylonCanvas'
import { createDemoScene } from './demoScene'

function App() {
  return <BabylonCanvas onSceneReady={createDemoScene} />
}

export default App
