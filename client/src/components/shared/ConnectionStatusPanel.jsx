"use client";

import { Circle } from "lucide-react";

export default function ConnectionStatusPanel({
  healthLoading,
  serverHealthOk,
  tokenPresent,
  handleClearToken,
  jobId,
  jobStatus,
  feedItemsCount,
  classifiedCount,
  activeQueries,
  handleResetStores,
}) {
  return (
    <div className="absolute bottom-12 left-0 w-72 bg-surface-warm border border-border rounded p-4 space-y-4 text-text-secondary">
      <div className="text-text-primary font-semibold text-xs uppercase tracking-widest pb-2 border-b border-border">
        Connection Status (Dev)
      </div>

      <div className="flex items-center gap-2">
        <Circle size={8} className={serverHealthOk ? "fill-green-400 text-green-400" : "fill-red-400 text-red-400"} />
        <span>Server: {healthLoading ? "checking..." : serverHealthOk ? "OK" : "Error"}</span>
      </div>

      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Circle size={8} className={tokenPresent ? "fill-green-400 text-green-400" : "fill-red-400 text-red-400"} />
          <span>Token: {tokenPresent ? "Present" : "Missing"}</span>
        </div>
        {tokenPresent && (
          <button onClick={handleClearToken} className="text-xs px-2 py-1 bg-red-400/20 hover:bg-red-400/30 rounded text-red-400">
            Clear
          </button>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <div className="font-semibold text-text-primary">Investigation</div>
        <div>Job ID: {jobId || "none"}</div>
        <div>
          Status:{" "}
          <span
            className={
              jobStatus === "running"
                ? "text-agent-blue"
                : jobStatus === "complete"
                  ? "text-green-400"
                  : jobStatus === "failed"
                    ? "text-red-400"
                    : "text-text-muted"
            }
          >
            {jobStatus}
          </span>
        </div>
        <div>Feed items: {feedItemsCount}</div>
        <div>Classified: {classifiedCount}</div>
      </div>

      <div className="space-y-1 text-xs border-t border-border pt-2">
        <div className="font-semibold text-text-primary">React Query</div>
        {activeQueries.length === 0 ? (
          <div className="text-text-muted">No active queries</div>
        ) : (
          activeQueries.map((query) => (
            <div key={query.queryHash} className="text-text-muted">
              {JSON.stringify(query.queryKey).substring(0, 40)}...{" "}
              <span
                className={
                  query.state.status === "success"
                    ? "text-green-400"
                    : query.state.status === "error"
                      ? "text-red-400"
                      : "text-yellow-400"
                }
              >
                [{query.state.status}]
              </span>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-2">
        <button
          onClick={handleResetStores}
          className="w-full text-xs px-2 py-1 bg-surface-warm border border-border rounded hover:bg-surface transition"
        >
          Reset Stores
        </button>
      </div>
    </div>
  );
}
