"use client";

import React from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { clearStoredToken } from "@/lib/api";

/**
 * Global client error boundary — catches render errors anywhere in the
 * component tree below where it is mounted (currently inside <Providers>).
 *
 * The Next.js App Router also has its own `app/error.js` for *route-level*
 * errors; this one is a fallback for client-side render errors that the
 * route-level boundary may not catch.
 *
 * Uses Night Watch design tokens (CSS variables) via Tailwind arbitrary
 * values so it renders with the dark theme out of the box.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("AppErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleNavigateHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/overview";
  };

  handleClearData = () => {
    clearStoredToken();
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isDevelopment = process.env.NODE_ENV === "development";

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-base)] p-4">
        <div className="w-full max-w-md border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-8">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            <div className="inline-flex h-16 w-16 items-center justify-center border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)]">
              <AlertCircle
                size={28}
                strokeWidth={1.5}
                className="text-[var(--sev-serious)]"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Title & Description */}
          <h1 className="mb-2 text-center font-sans text-lg font-semibold text-[var(--fg-1)]">
            Something went wrong
          </h1>
          <p className="mb-6 text-center text-sm text-[var(--fg-3)]">
            The application encountered an unexpected error.
          </p>

          {/* Error Message */}
          <div className="mb-6 max-h-32 overflow-auto border border-[var(--border-hairline)] bg-[var(--bg-base)] p-3 font-mono text-xs text-[var(--fg-4)]">
            <p className="break-words text-[var(--sev-serious)]">
              {this.state.error?.message || "Unknown error"}
            </p>
            {isDevelopment && this.state.errorInfo && (
              <details className="mt-3 text-xs text-[var(--fg-4)]">
                <summary className="cursor-pointer hover:text-[var(--fg-2)]">
                  Stack Trace (Development Only)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={this.handleReload}
              className="flex w-full items-center justify-center gap-2 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] bg-[var(--accent)] text-[var(--bg-base)] transition-opacity hover:opacity-85 focus-visible:outline-none"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reload Page
            </button>

            <button
              onClick={this.handleNavigateHome}
              className="flex w-full items-center justify-center gap-2 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] border border-[var(--border-strong)] bg-transparent text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)] focus-visible:outline-none"
            >
              <Home size={16} aria-hidden="true" />
              Back to Overview
            </button>

            <button
              onClick={this.handleClearData}
              className="w-full px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] border border-[var(--sev-serious-dim)] bg-transparent text-[var(--sev-serious)] transition-colors hover:bg-[var(--sev-serious-bg)] focus-visible:outline-none"
            >
              Clear All Data (Last Resort)
            </button>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-[var(--fg-4)]">
            If this persists, contact the operations team.
          </p>
        </div>
      </div>
    );
  }
}
