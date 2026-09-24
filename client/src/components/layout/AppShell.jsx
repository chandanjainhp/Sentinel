export default function AppShell({ variant = "investigate", children }) {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] w-full overflow-hidden bg-surface text-text-primary">
      {/* Main Dynamically Structured Interactive Pane */}
      <div className="flex-1 overflow-hidden relative">
        {variant === "investigate" ? (
          <div className="flex flex-col md:flex-row h-full overflow-hidden">
            {/* Left Column (AgentFeed) - Hidden on mobile, visible on md+ */}
            <div className="hidden md:flex w-full md:w-80 lg:w-[300px] flex-col flex-shrink-0 h-full overflow-y-auto border-r border-border bg-surface">
              {Array.isArray(children) ? children[0] : null}
            </div>

            {/* Center Column (Map + Timeline) - Takes full width on mobile, flex on md+ */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
              {Array.isArray(children) ? children[1] : null}
            </div>

            {/* Right Column (EventPanel) - Hidden on mobile, visible on lg+ */}
            <div className="hidden lg:flex w-full lg:w-96 flex-col flex-shrink-0 h-full overflow-y-auto border-l border-border bg-surface">
              {Array.isArray(children) ? children[2] : null}
            </div>
          </div>
        ) : variant === "detail" ? (
          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-y-auto">{Array.isArray(children) ? children[0] : children}</div>
            <div className="hidden lg:flex w-full lg:w-[380px] flex-col flex-shrink-0 h-full overflow-y-auto border-t lg:border-t-0 lg:border-l border-border bg-surface">{Array.isArray(children) ? children[1] : null}</div>
          </div>
        ) : variant === "briefing" ? (
          <div className="flex justify-center h-full bg-surface-2 overflow-y-auto">
            <div className="w-full max-w-3xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
          </div>
        ) : (
          <div className="flex h-full overflow-hidden">{children}</div>
        )}
      </div>
    </div>
  );
}
