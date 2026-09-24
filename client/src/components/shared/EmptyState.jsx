import { Inbox, Clock, Search, AlertCircle } from "lucide-react";

const ICON_MAP = {
  inbox: { Component: Inbox, className: "text-text-muted" },
  clock: { Component: Clock, className: "text-text-muted animate-pulse" },
  search: { Component: Search, className: "text-text-muted" },
  "alert-circle": {
    Component: AlertCircle,
    className: "text-severity-serious",
  },
};

export default function EmptyState({ title, description, icon }) {
  const iconConfig = icon ? ICON_MAP[icon] : null;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 py-12 px-6 text-center">
      {iconConfig && (
        <iconConfig.Component
          className={`w-12 h-12 ${iconConfig.className}`}
          strokeWidth={1.25}
        />
      )}
      <span className="text-text-secondary font-medium text-sm">{title}</span>
      {description && (
        <span className="text-text-muted text-xs leading-relaxed max-w-xs">
          {description}
        </span>
      )}
    </div>
  );
}
