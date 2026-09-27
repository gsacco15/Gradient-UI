// If a page crashes, show a calm way out instead of a blank screen.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <div>
          <p className="crash-eyebrow">Atmos</p>
          <h1>Something went cloudy.</h1>
          <p>This page hit an error. Your saved skies are safe in this browser.</p>
          <div className="crash-actions">
            <button onClick={() => location.reload()}>Reload</button>
            <a href="/">Back home</a>
          </div>
        </div>
      </div>
    );
  }
}
