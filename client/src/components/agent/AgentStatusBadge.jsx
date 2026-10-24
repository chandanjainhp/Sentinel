"use client";

export default function AgentStatusBadge({ jobStatus }) {
  const state = {
    idle: {
      dot: "bg-text-muted",
      text: "text-text-muted",
      label: "IDLE",
      pulse: false,
    },
    connecting: {
      dot: "bg-agent-blue",
      text: "text-agent-blue",
      label: "CONNECTING",
      pulse: true,
    },
    running: {
      dot: "bg-agent-blue",
      text: "text-agent-blue",
      label: "RUNNING",
      pulse: true,
    },
    complete: {
      dot: "bg-severity-harmless",
      text: "text-severity-harmless",
      label: "COMPLETE",
      pulse: false,
    },
    failed: {
      dot: "bg-severity-serious",
      text: "text-severity-serious",
      label: "FAILED",
      pulse: false,
    },
  }[jobStatus] || {
    dot: "bg-text-muted",
    text: "text-text-muted",
    label: "IDLE",
    pulse: false,
  };

  return (
    <div
      className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] ${state.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${state.dot} ${state.pulse ? "dot-pulse" : ""}`}
      />
      <span>{state.label}</span>
    </div>
  );
}
