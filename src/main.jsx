import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
          <section className="mx-auto max-w-2xl rounded-lg border border-rose-300/30 bg-rose-950/30 p-5">
            <h1 className="text-lg font-semibold text-rose-100">앱 실행 오류</h1>
            <p className="mt-2 text-sm text-rose-50">
              브라우저에서 실행 중 문제가 발생했습니다. 아래 메시지를 알려주시면 바로 이어서 잡을 수 있습니다.
            </p>
            <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-rose-100">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

