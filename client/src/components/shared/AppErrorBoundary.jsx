"use client";

import React from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { clearStoredToken } from "@/lib/api";

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
    window.location.href = "/incidents";
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
      <div className="h-screen w-screen bg-surface flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-2 border border-border rounded-lg p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-400/10 rounded-lg">
              <AlertCircle size={32} className="text-red-400" />
            </div>
          </div>

          {/* Title & Description */}
          <h1 className="text-center text-lg font-semibold text-primary mb-2">
            Something went wrong
          </h1>
          <p className="text-center text-sm text-text-secondary mb-6">
            The application encountered an unexpected error
          </p>

          {/* Error Message */}
          <div className="mb-6 p-4 bg-surface-3 border border-border rounded font-mono text-xs text-text-muted overflow-auto max-h-32">
            <p className="text-red-400 wrap-break-word">
              {this.state.error?.message || "Unknown error"}
            </p>
            {isDevelopment && this.state.errorInfo && (
              <details className="mt-3 text-text-muted text-xs">
                <summary className="cursor-pointer hover:text-text-secondary">
                  Stack Trace (Development Only)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-xs">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={this.handleReload}
              className="w-full px-4 py-2 bg-agent-blue text-white rounded font-medium hover:bg-agent-blue/90 transition flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Reload Page
            </button>

            <button
              onClick={this.handleNavigateHome}
              className="w-full px-4 py-2 bg-surface-3 text-text-primary border border-border rounded font-medium hover:bg-surface-4 transition flex items-center justify-center gap-2"
            >
              <Home size={16} />
              Go to Investigation
            </button>

            <button
              onClick={this.handleClearData}
              className="w-full px-4 py-2 bg-surface-3 text-text-secondary border border-border rounded font-medium hover:bg-surface-4 transition text-sm"
            >
              Clear All Data (Last Resort)
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-text-muted mt-6">
            If this persists, contact the operations team
          </p>
        </div>
      </div>
    );
  }
}
