import { Component } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Keeps the rest of the page usable when the 3D view cannot start (most often: WebGL is
 * unavailable or disabled). Errors thrown while creating the Babylon engine land here.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="viewer-fallback" role="status">
          <p>
            <strong>The 3D view is unavailable in this browser.</strong>
          </p>
          <p>
            It needs WebGL, which may be turned off or unsupported here (for example when hardware acceleration is
            disabled). The line counts and equations on the right still work.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
