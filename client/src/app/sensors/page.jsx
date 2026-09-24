"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Ban, Check, ChevronRight, CircleDashed, Loader2, Pencil, Plus, Radio } from "lucide-react";
import {
  getSensorSummary, listSensors, getSites, getMachinesForSite,
  updateSensor, deleteSensor, getApiKeyMeta,
} from "@/lib/api";
import AddSensorModal from "@/components/sensors/AddSensorModal";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

const STATUS_COLORS = {
  ONLINE: "var(--sev-harmless)",
  STALE: "var(--sev-minor)",
  OFFLINE: "var(--sev-serious)",
  WAITING: "var(--fg-4)",
};

const PRIMARY_BTN = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  background: "var(--accent)",
  color: "var(--bg-base)",
  border: "1px solid var(--accent)",
  borderRadius: "2px",
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
};

const SECONDARY_BTN = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "5px 10px",
  background: "transparent",
  color: "var(--fg-2)",
  border: "1px solid var(--border-default)",
  borderRadius: "2px",
  fontFamily: MONO,
  fontSize: "10px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
};

const DANGER_BTN = {
  ...SECONDARY_BTN,
  color: "var(--sev-serious)",
  borderColor: "var(--sev-serious)",
};

const FIELD = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  background: "var(--bg-surface-2)",
  border: "1px solid var(--border-default)",
  borderRadius: "2px",
  color: "var(--fg-1)",
  fontFamily: SANS,
  fontSize: "13px",
  outline: "none",
};

const LABEL = {
  display: "block",
  fontFamily: MONO,
  fontSize: "10px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--fg-3)",
  marginBottom: "6px",
};

const TD = {
  padding: "10px 12px",
  fontFamily: SANS,
  fontSize: "12px",
  color: "var(--fg-1)",
  borderBottom: "1px solid var(--border-hairline)",
  whiteSpace: "nowrap",
};

function formatInterval(sec) {
  if (!sec && sec !== 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = sec / 60;
  if (m < 60) return `${m % 1 === 0 ? m : m.toFixed(1)}m`;
  const h = m / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

function relative(iso) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "var(--fg-4)";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontFamily: MONO,
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      color,
    }}>
      <span style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: color,
        boxShadow: status === "ONLINE" ? `0 0 6px ${color}` : "none",
      }} />
      {status}
    </span>
  );
}

function EditSensorDialog({ sensor, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(sensor?.name || "");
  const [intervalSec, setIntervalSec] = useState(String(sensor?.expectedIntervalSec ?? 60));

  const parsed = Number(intervalSec);
  const intervalValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 86400;
  const canSave = name.trim().length >= 2 && intervalValid;

  const mutation = useMutation({
    mutationFn: () => updateSensor(sensor._id, { name: name.trim(), expectedIntervalSec: parsed }),
    onSuccess: () => {
      toast.success("Sensor updated");
      queryClient.invalidateQueries({ queryKey: ["sensors"] });
      queryClient.invalidateQueries({ queryKey: ["sensor-summary"] });
      onClose();
    },
    onError: (err) => toast.error(err?.message ?? "Failed to update sensor"),
  });

  return (
    <Dialog.Root open={Boolean(sensor)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
        <Dialog.Content style={{
          position: "fixed", zIndex: 50, top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", width: "100%", maxWidth: "420px",
          background: "var(--bg-surface-1)", border: "1px solid var(--border-strong)",
          borderRadius: "2px", padding: "18px", outline: "none",
        }}>
          <Dialog.Title style={{
            margin: "0 0 14px 0", fontFamily: MONO, fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-1)",
          }}>
            Edit sensor
          </Dialog.Title>
          <Dialog.Description style={{ display: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={LABEL}>Name</label>
              <input style={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={LABEL}>Expected interval (seconds)</label>
              <input
                style={FIELD}
                type="number"
                min={1}
                max={86400}
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
              />
              {!intervalValid && (
                <div style={{ fontFamily: SANS, fontSize: "11px", color: "var(--sev-minor)", marginTop: "6px" }}>
                  Must be a whole number of seconds, 1–86400
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" onClick={onClose} style={{ ...SECONDARY_BTN, padding: "8px 14px", fontSize: "11px" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!canSave || mutation.isPending}
                style={{ ...PRIMARY_BTN, opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "not-allowed" }}
              >
                {mutation.isPending && <Loader2 size={11} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteSensorDialog({ sensor, onClose }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteSensor(sensor._id),
    onSuccess: () => {
      toast.success("Sensor deleted");
      queryClient.invalidateQueries({ queryKey: ["sensors"] });
      queryClient.invalidateQueries({ queryKey: ["sensor-summary"] });
      onClose();
    },
    onError: (err) => toast.error(err?.message ?? "Failed to delete sensor"),
  });

  return (
    <Dialog.Root open={Boolean(sensor)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
        <Dialog.Content style={{
          position: "fixed", zIndex: 50, top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", width: "100%", maxWidth: "420px",
          background: "var(--bg-surface-1)", border: "1px solid var(--border-strong)",
          borderRadius: "2px", padding: "18px", outline: "none",
        }}>
          <Dialog.Title style={{
            margin: "0 0 8px 0", fontFamily: SANS, fontSize: "15px",
            fontWeight: 600, color: "var(--fg-1)",
          }}>
            Delete sensor?
          </Dialog.Title>
          <Dialog.Description style={{
            margin: "0 0 16px 0", fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)",
          }}>
            {sensor?.name} will stop receiving readings and its slot frees up for a new sensor.
          </Dialog.Description>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" onClick={onClose} style={{ ...SECONDARY_BTN, padding: "8px 14px", fontSize: "11px" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              style={{ ...DANGER_BTN, padding: "8px 14px", fontSize: "11px", opacity: mutation.isPending ? 0.5 : 1 }}
            >
              {mutation.isPending && <Loader2 size={12} className="animate-spin" />}
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* Onboarding checklist, derived from real account state. Hidden when all done. */
function OnboardingChecklist({ steps }) {
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;
  return (
    <section style={{
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "2px",
      padding: "18px",
      marginBottom: "24px",
    }}>
      <div style={{ ...LABEL, marginBottom: "12px" }}>Getting started</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
        {steps.map((step) => (
          <li key={step.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {step.done ? (
              <Check size={14} style={{ color: "var(--sev-harmless)", flexShrink: 0 }} />
            ) : (
              <CircleDashed size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
            )}
            <span style={{
              fontFamily: SANS,
              fontSize: "13px",
              color: step.done ? "var(--fg-4)" : "var(--fg-1)",
              textDecoration: step.done ? "line-through" : "none",
            }}>
              {step.label}
            </span>
            {!step.done && step.action && (
              <button
                type="button"
                onClick={step.action}
                style={{ ...SECONDARY_BTN, marginLeft: "auto", color: "var(--accent)", borderColor: "var(--border-default)" }}
              >
                {step.actionLabel}
                <ChevronRight size={10} />
              </button>
            )}
            {!step.done && !step.action && step.actionHref && (
              <Link
                href={step.actionHref}
                style={{
                  ...SECONDARY_BTN,
                  marginLeft: "auto",
                  color: "var(--accent)",
                  borderColor: "var(--border-default)",
                  textDecoration: "none",
                }}
              >
                {step.actionLabel}
                <ChevronRight size={10} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function SensorsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // 10s polling; paused while the tab is hidden.
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["sensor-summary"],
    queryFn: getSensorSummary,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: sensors, isLoading: sensorsLoading } = useQuery({
    queryKey: ["sensors"],
    queryFn: listSensors,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  // Checklist data sources
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: getSites,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  const firstSiteId = sites?.[0]?._id;
  const { data: firstSiteMachines } = useQuery({
    queryKey: ["machines", firstSiteId, "checklist"],
    queryFn: () => getMachinesForSite(firstSiteId),
    enabled: Boolean(firstSiteId),
  });
  const { data: keyMeta } = useQuery({
    queryKey: ["api-key"],
    queryFn: getApiKeyMeta,
  });

  const summaryData = summary || { limit: 20, total: 0, remaining: 20, counts: {}, byType: {} };
  const counts = summaryData.counts || {};
  const byTypeEntries = Object.entries(summaryData.byType || {}).sort((a, b) => b[1] - a[1]);
  const atLimit = summaryData.remaining <= 0;
  const sensorList = sensors || [];

  const hasSite = (sites?.length ?? 0) > 0;
  const hasMachine = (firstSiteMachines?.length ?? 0) > 0;
  const hasSensor = sensorList.length > 0;
  const hasKey = Boolean(keyMeta);
  const hasReading = sensorList.some((s) => Boolean(s.lastReadingAt));

  const checklistSteps = [
    {
      label: "Create a site",
      done: hasSite,
      actionLabel: "Add sensor",
      action: () => setAddOpen(true),
    },
    {
      label: "Add a machine",
      done: hasMachine,
      actionLabel: "Add sensor",
      action: () => setAddOpen(true),
    },
    {
      label: "Add a sensor",
      done: hasSensor,
      actionLabel: "Add sensor",
      action: () => setAddOpen(true),
    },
    {
      label: "Generate an API key",
      done: hasKey,
      actionLabel: "Open settings",
      actionHref: "/settings/api-key",
    },
    {
      label: "Send the first reading",
      done: hasReading,
      actionLabel: "How?",
      actionHref: "/docs",
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      padding: "32px 24px",
      maxWidth: "1100px",
      margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "24px",
        flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontFamily: SANS, fontSize: "18px", fontWeight: 600,
            color: "var(--fg-1)", margin: 0,
          }}>
            <Radio size={16} style={{ color: "var(--accent)" }} />
            Sensors
          </h1>
          <p style={{ marginTop: "6px", marginBottom: 0, fontFamily: SANS, fontSize: "12px", color: "var(--fg-3)" }}>
            Sites → machines → sensors. One API key authenticates all your gateways.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={atLimit}
          title={atLimit ? `Limit reached (${summaryData.total}/${summaryData.limit})` : undefined}
          style={{
            ...PRIMARY_BTN,
            opacity: atLimit ? 0.4 : 1,
            cursor: atLimit ? "not-allowed" : "pointer",
          }}
        >
          <Plus size={11} />
          {atLimit ? `Limit reached (${summaryData.total}/${summaryData.limit})` : "Add sensor"}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        marginBottom: "24px",
      }}>
        <StatPill
          label="Added"
          value={summaryLoading ? "—" : `${summaryData.total} / ${summaryData.limit}`}
          color="var(--accent)"
        />
        <StatPill label="Online" value={counts.online ?? 0} color="var(--sev-harmless)" />
        <StatPill label="Stale" value={counts.stale ?? 0} color="var(--sev-minor)" />
        <StatPill label="Offline" value={counts.offline ?? 0} color="var(--sev-serious)" />
        <StatPill label="Waiting" value={counts.waiting ?? 0} color="var(--fg-4)" />
        {byTypeEntries.length > 0 && (
          <StatPill
            label="By type"
            value={byTypeEntries.map(([t, n]) => `${t} ${n}`).join(" · ")}
            color="var(--fg-2)"
          />
        )}
      </div>

      {/* Onboarding checklist */}
      <OnboardingChecklist steps={checklistSteps} />

      {/* Sensor table */}
      <section style={{
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          background: "var(--bg-surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: MONO, fontSize: "10px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-3)",
          }}>
            All sensors
          </span>
          <span style={{ fontFamily: MONO, fontSize: "10px", color: "var(--fg-4)" }}>
            auto-refreshes every 10s
          </span>
        </div>

        {sensorsLoading ? (
          <div style={{
            padding: "24px 16px", display: "flex", alignItems: "center", gap: "8px",
            color: "var(--fg-3)", fontFamily: MONO, fontSize: "11px",
          }}>
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : sensorList.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center" }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)" }}>
              No sensors yet. Add your first sensor to start receiving readings.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Name", "Type", "Machine", "Site", "Status", "Last reading", "Interval", ""].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "8px 12px",
                      fontFamily: MONO, fontSize: "9px", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.12em",
                      color: "var(--fg-4)", borderBottom: "1px solid var(--border-hairline)",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensorList.map((s) => (
                  <tr key={s._id}>
                    <td style={TD}>{s.name}</td>
                    <td style={{ ...TD, color: "var(--fg-3)" }}>{s.type}</td>
                    <td style={{ ...TD, color: "var(--fg-3)" }}>{s.machineName || "—"}</td>
                    <td style={{ ...TD, color: "var(--fg-3)" }}>{s.siteName || "—"}</td>
                    <td style={TD}><StatusBadge status={s.status} /></td>
                    <td style={{ ...TD, color: "var(--fg-3)" }}>
                      {s.lastReadingAt ? relative(s.lastReadingAt) : "—"}
                      {typeof s.ageSec === "number" && s.ageSec < 3600
                        ? <span style={{ marginLeft: "6px", color: "var(--fg-4)" }}>({s.ageSec}s ago)</span>
                        : null}
                    </td>
                    <td style={{ ...TD, color: "var(--fg-3)" }}>{formatInterval(s.expectedIntervalSec)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <button type="button" onClick={() => setEditTarget(s)} style={SECONDARY_BTN}>
                        <Pencil size={10} /> Edit
                      </button>{" "}
                      <button type="button" onClick={() => setDeleteTarget(s)} style={DANGER_BTN}>
                        <Ban size={10} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modals */}
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} summary={summary} />
      <EditSensorDialog sensor={editTarget} onClose={() => setEditTarget(null)} />
      <DeleteSensorDialog sensor={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 120px",
      minWidth: "120px",
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "2px",
      padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: MONO, fontSize: "9px", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.12em",
        color: "var(--fg-3)", marginBottom: "6px",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: "16px", fontWeight: 700, color,
        lineHeight: 1, wordBreak: "break-all",
      }}>
        {value}
      </div>
    </div>
  );
}
