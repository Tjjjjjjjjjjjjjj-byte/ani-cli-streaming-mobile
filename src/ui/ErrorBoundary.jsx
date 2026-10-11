import { Component } from "react";
import { useLocation } from "react-router-dom";

// Catches render errors below it so one broken page never blanks the whole app.
// resetKey: when it changes (we pass the current path) the error is cleared, so navigating away recovers.
class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="discover__message" role="alert">
        <span className="material-symbols-outlined" aria-hidden="true">
          error
        </span>
        <p>Something went wrong while showing this page.</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
