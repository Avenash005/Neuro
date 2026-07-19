import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Neuron rendering error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <p>Neuron hit an unexpected error.</p>
          <h1>Your memories are safe.</h1>
          <span>Reload the app to try again. If the problem continues, check the browser console for the diagnostic trace.</span>
          <button onClick={() => window.location.reload()}>Reload Neuron</button>
        </main>
      );
    }
    return this.props.children;
  }
}
