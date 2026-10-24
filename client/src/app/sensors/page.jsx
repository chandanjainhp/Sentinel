"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  X,
} from "lucide-react";
import {
  getSensorSummary,
  listSensors,
  getSites,
  getMachinesForSite,
  getMachineDetail,
  getMachineCoverages,
  updateSensor,
  deleteSensor,
  listApiKeys,
  getIncidents,
} from "@/lib/api";
import AddSensorModal from "@/components/sensors/AddSensorModal";
import PageContainer from "@/components/layout/PageContainer";
import { healthMeta } from "@/lib/health";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";
const DISPLAY = "var(--font-display)";

const STATUS_COLORS = {
  ONLINE: "var(--sev-harmless)",
  STALE: "var(--sev-minor)",
  OFFLINE: "var(--sev-serious)",
  WAITING: "var(--fg-4)",
};

const SEVERITY_COLORS = {
  healthy: "var(--health-healthy)",
  warning: "var(--health-warning)",
  critical: "var(--health-critical)",
  offline: "var(--health-offline)",
  unknown: "var(--health-unknown)",
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

function formatValue(value) {
  if (typeof value !== "number") return "—";
  return Math.abs(value) >= 100
    ? value.toFixed(0)
    : Math.abs(value) >= 10
    ? value.toFixed(1)
    : value.toFixed(2);
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "var(--fg-4)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: MONO,
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          boxShadow: status === "ONLINE" ? `0 0 6px ${color}` : "none",
        }}
      />
      {status}
    </span>
  );
}

function HealthBadge({ health }) {
  const { token, label } = healthMeta(health) || healthMeta("unknown");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: MONO,
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: token,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: token,
          boxShadow: health === "healthy" ? `0 0 6px ${token}` : "none",
        }}
      />
      {label}
    </span>
  );
}

function StatPill({ label, value, color, loading }) {
  return (
    <div
      style={{
        flex: "1 1 120px",
        minWidth: "120px",
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "9px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--fg-3)",
          marginBottom: "6px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "16px",
          fontWeight: 700,
          color: loading ? "var(--fg-4)" : color,
          lineHeight: 1,
          wordBreak: "break-all",
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : value}
      </div>
    </div>
  );
}

function TrendChart({ series }) {
  const points = series.points || [];
  if (!points.length) {
    return (
      <div
        className="empty-state"
        style={{ minHeight: 180, display: "grid", placeItems: "center" }}
      >
        No readings in the available window
      </div>
    );
  }

  const values = points.map((point) => point.v);
  const threshold = typeof series.threshold === "number" ? series.threshold : null;
  const min = Math.min(
    ...values,
    ...(threshold == null ? [] : [threshold])
  );
  const max = Math.max(
    ...values,
    ...(threshold == null ? [] : [threshold])
  );
  const range = max - min || 1;
  const x = (index) =>
    4 + (index / Math.max(points.length - 1, 1)) * 992;
  const y = (value) => 164 - ((value - min) / range) * 148;
  const path = points
    .map((point, index) =>
      `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.v).toFixed(1)}`
    )
    .join(" ");
  const last = points[points.length - 1];
  const unit = series.unit || "";

  return (
    <div
      style={{
        background: "var(--graphite)",
        border: "1px solid var(--line)",
        padding: "14px 16px 10px",
      }}
    >
      <svg
        viewBox="0 0 1000 180"
        role="img"
        aria-label={series.name + " sensor trend"}
        style={{ width: "100%", height: 190, display: "block" }}
      >
        {threshold != null && (
          <line
            x1="0"
            x2="1000"
            y1={y(threshold)}
            y2={y(threshold)}
            stroke="var(--amber)"
            strokeDasharray="8 6"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="var(--bone)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(last.v)}
          r="4"
          fill="var(--amber)"
        >
          <title>
            {formatValue(last.v)} {unit} at {new Date(last.t).toLocaleString()}
          </title>
        </circle>
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: MONO,
          fontSize: 10,
          color: "var(--dim)",
        }}
      >
        <span>
          {formatValue(Math.min(...values))}–{formatValue(Math.max(...values))} {unit}
        </span>
        <span>
          Latest {formatValue(last.v)} {unit} ·
          {new Date(last.t).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>
      {threshold != null && (
        <div
          style={{
            marginTop: 6,
            fontFamily: MONO,
            fontSize: 10,
            color: "var(--amber)",
          }}
        >
          Configured threshold · {formatValue(threshold)} {unit}
        </div>
      )}
    </div>
  );
}

function EditSensorDialog({ sensor, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(sensor?.name || "");
  const [intervalSec, setIntervalSec] = useState(
    String(sensor?.expectedIntervalSec ?? 60)
  );

  const parsed = Number(intervalSec);
  const intervalValid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= 86400;
  const canSave = name.trim().length >= 2 && intervalValid;

  const mutation = useMutation({
    mutationFn: () =>
      updateSensor(sensor._id, {
        name: name.trim(),
        expectedIntervalSec: parsed,
      }),
    onSuccess: () => {
      toast.success("Sensor updated");
      queryClient.invalidateQueries({ queryKey: ["sensors"] });
      queryClient.invalidateQueries({ queryKey: ["sensor-summary"] });
      onClose();
    },
    onError: (err) =>
      toast.error(err?.message ?? "Failed to update sensor"),
  });

  return (
    <Dialog.Root
      open={Boolean(sensor)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            zIndex: 50,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100%",
            maxWidth: "420px",
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-strong)",
            borderRadius: "2px",
            padding: "18px",
            outline: "none",
          }}
        >
          <Dialog.Title
            style={{
              margin: "0 0 14px 0",
              fontFamily: MONO,
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--fg-1)",
            }}
          >
            Edit sensor
          </Dialog.Title>
          <Dialog.Description style={{ display: "none" }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div>
              <label style={LABEL}>Name</label>
              <input
                style={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: "11px",
                    color: "var(--sev-minor)",
                    marginTop: "6px",
                  }}
                >
                  Must be a whole number of seconds, 1–86400
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{ ...SECONDARY_BTN, padding: "8px 14px", fontSize: "11px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!canSave || mutation.isPending}
                style={{
                  ...PRIMARY_BTN,
                  opacity: canSave ? 1 : 0.4,
                  cursor: canSave ? "pointer" : "not-allowed",
                }}
              >
                {mutation.isPending && (
                  <Loader2 size={11} className="animate-spin" />
                )}
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
    onError: (err) =>
      toast.error(err?.message ?? "Failed to delete sensor"),
  });

  return (
    <Dialog.Root
      open={Boolean(sensor)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            zIndex: 50,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100%",
            maxWidth: "420px",
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-strong)",
            borderRadius: "2px",
            padding: "18px",
            outline: "none",
          }}
        >
          <Dialog.Title
            style={{
              margin: "0 0 8px 0",
              fontFamily: SANS,
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--fg-1)",
            }}
          >
            Delete sensor?
          </Dialog.Title>
          <Dialog.Description
            style={{
              margin: "0 0 16px 0",
              fontFamily: SANS,
              fontSize: "13px",
              color: "var(--fg-3)",
            }}
          >
            {sensor?.name} will stop receiving readings and its slot frees up
            for a new sensor.
          </Dialog.Description>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{ ...SECONDARY_BTN, padding: "8px 14px", fontSize: "11px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              style={{
                ...DANGER_BTN,
                padding: "8px 14px",
                fontSize: "11px",
                opacity: mutation.isPending ? 0.5 : 1,
              }}
            >
              {mutation.isPending && (
                <Loader2 size={12} className="animate-spin" />
              )}
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MachineReadinessRow({ entry }) {
  const { coverage } = entry;
  const gateStateUi = {
    FULLY_COVERED: {
      icon: ShieldCheck,
      color: "var(--sev-harmless)",
      label: "Live",
      detail: "Predictions run automatically on incoming events",
    },
    PARTIAL_REPORTING: {
      icon: ShieldAlert,
      color: "var(--sev-minor)",
      label: "Partial reporting",
      detail: "All required sensors attached, but some are not reporting",
    },
    GATE_CLOSED: {
      icon: ShieldOff,
      color: "var(--fg-4)",
      label: "Gate closed",
      detail: "Not enough sensors attached yet — predictions will not run",
    },
  };
  const ui = gateStateUi[coverage.gateState] || gateStateUi.GATE_CLOSED;
  const Icon = ui.icon;

  const channelState = (channel) =>
    coverage.covered.includes(channel)
      ? "covered"
      : coverage.missing.includes(channel)
      ? "missing"
      : "notRequired";

  const colors = {
    covered: { color: "var(--sev-harmless)", borderColor: "var(--border-default)" },
    missing: { color: "var(--sev-serious)", borderColor: "var(--border-default)" },
    notRequired: {
      color: "var(--fg-4)",
      borderColor: "var(--border-hairline)",
    },
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "14px",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: "190px",
        }}
      >
        <Icon size={15} style={{ color: ui.color }} />
        <div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--fg-1)",
              lineHeight: 1.2,
            }}
          >
            {entry.name}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "9px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: ui.color,
              marginTop: "2px",
            }}
          >
            {ui.label}
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: "10px",
          color: "var(--fg-3)",
          whiteSpace: "nowrap",
        }}
      >
        {coverage.sensorsWorking}/{coverage.sensorsTotal} sensors working
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "5px",
          flex: 1,
          minWidth: "220px",
        }}
      >
        {coverage.required.map((channel) => {
          const state = channelState(channel);
          const IconComp =
            state === "covered" ? Check : state === "missing" ? Ban : null;
          return (
            <span
              key={channel}
              title={
                state === "covered"
                  ? "Reporting"
                  : state === "missing"
                  ? "Required, not reporting"
                  : "Not required"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                border: "1px solid",
                borderRadius: "2px",
                fontFamily: MONO,
                fontSize: "9px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                ...colors[state],
              }}
            >
              {IconComp && <IconComp size={9} />}
              {channel}
            </span>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: SANS,
          fontSize: "11px",
          color: "var(--fg-3)",
          flexBasis: "100%",
          display: coverage.isReady ? "none" : "block",
        }}
      >
        {coverage.gateState === "GATE_CLOSED" && coverage.unattached.length > 0 && (
          <>
            Attach sensors for:
            <span
              style={{
                color: "var(--fg-1)",
                fontFamily: MONO,
                fontSize: "10px",
              }}
            >
              {coverage.unattached.join(", ")}
            </span>
          </>
        )}
        {coverage.gateState === "PARTIAL_REPORTING" && (
          <>
            Waiting for readings from:
            <span
              style={{
                color: "var(--fg-1)",
                fontFamily: MONO,
                fontSize: "10px",
              }}
            >
              {coverage.missing.join(", ")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function MachineReadinessSection({ machines, isLoading }) {
  if (isLoading) {
    return (
      <section
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "2px",
          padding: "24px 16px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "var(--fg-3)",
          fontFamily: MONO,
          fontSize: "11px",
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Loading machine readiness…
      </section>
    );
  }

  if (!machines || machines.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        overflow: "hidden",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          background: "var(--bg-surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--fg-3)",
          }}
        >
          Machine readiness
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            color: "var(--fg-4)",
          }}
        >
          predictions start automatically once required sensors report
        </span>
      </div>
      {machines.map((entry) => (
        <MachineReadinessRow key={entry.machineId} entry={entry} />
      ))}
    </section>
  );
}

export default function SensorsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: getSites,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const { data: machineCoverages, isLoading: coveragesLoading } = useQuery({
    queryKey: ["machine-coverages"],
    queryFn: getMachineCoverages,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  // Get machines for selected site
  const { data: siteMachines } = useQuery({
    queryKey: ["machines", selectedSiteId],
    queryFn: () => getMachinesForSite(selectedSiteId),
    enabled: Boolean(selectedSiteId),
  });

  // Get machine detail for selected machine to show trends
  const { data: machineDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["machine-detail", selectedMachineId],
    queryFn: () => getMachineDetail(selectedMachineId),
    enabled: Boolean(selectedMachineId),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });

  const summaryData = summary || { limit: 20, total: 0, remaining: 20, counts: {}, byType: {} };
  const counts = summaryData.counts || {};
  const byTypeEntries = Object.entries(summaryData.byType || {})
    .sort((a, b) => b[1] - a[1]);
  const atLimit = summaryData.remaining <= 0;
  const sensorList = sensors || [];

  const hasSite = (sites?.length ?? 0) > 0;
  const hasMachine = (siteMachines?.length ?? 0) > 0;
  const hasSensor = sensorList.length > 0;
  const hasKey = Array.isArray(apiKeys) && apiKeys.length > 0;
  const hasReading = sensorList.some((s) => Boolean(s.lastReadingAt));

  // Filter sensors based on search and filter criteria
  const filteredSensors = useMemo(() => {
    return sensorList.filter((sensor) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        (sensor.name &&
          sensor.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sensor.machineName &&
          sensor.machineName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sensor.siteName &&
          sensor.siteName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sensor.type &&
          sensor.type.toLowerCase().includes(searchQuery.toLowerCase()));

      // Site filter
      const matchesSite =
        !selectedSiteId ||
        sensor.siteId === selectedSiteId ||
        (sensor.siteName && sensor.siteName === selectedSiteId);

      // Machine filter
      const matchesMachine =
        !selectedMachineId ||
        sensor.machineId === selectedMachineId ||
        (sensor.machineName && sensor.machineName === selectedMachineId);

      // Status filter
      const matchesStatus =
        !selectedStatus || sensor.status === selectedStatus;

      return matchesSearch && matchesSite && matchesMachine && matchesStatus;
    });
  }, [sensorList, searchQuery, selectedSiteId, selectedMachineId, selectedStatus]);

  // Get available machines from sensors
  const availableMachines = useMemo(() => {
    const machines = new Map();
    sensorList.forEach((sensor) => {
      if (sensor.machineId) {
        machines.set(sensor.machineId, {
          id: sensor.machineId,
          name: sensor.machineName || sensor.machineId,
          siteId: sensor.siteId,
          siteName: sensor.siteName,
        });
      }
    });
    return Array.from(machines.values());
  }, [sensorList]);

  // Get selected machine's trend data
  const selectedMachineTrends = useMemo(() => {
    if (!selectedMachineId || !machineDetail) return [];
    return machineDetail.sensorTrends || [];
  }, [selectedMachineId, machineDetail]);

  // Get sensors with incidents
  const { data: incidents } = useQuery({
    queryKey: ["incidents"],
    queryFn: () => getIncidents({ limit: 100 }),
    enabled: hasSensor,
    staleTime: 60000,
  });

  // Count sensors with various statuses
  const sensorStats = useMemo(() => {
    const stats = {
      total: filteredSensors.length,
      reporting: 0,
      stale: 0,
      missing: 0,
      abnormal: 0,
    };

    filteredSensors.forEach((sensor) => {
      switch (sensor.status) {
        case "ONLINE":
          stats.reporting++;
          break;
        case "STALE":
          stats.stale++;
          break;
        case "OFFLINE":
        case "WAITING":
          stats.missing++;
          break;
      }
    });

    // Check for abnormal readings
    filteredSensors.forEach((sensor) => {
      if (sensor.lastReading && typeof sensor.lastReading.value === "number") {
        // If we have threshold info, check against it
        // This is a placeholder - real implementation would use actual threshold data
        if (sensor.threshold && sensor.lastReading.value > sensor.threshold) {
          stats.abnormal++;
        }
      }
    });

    return stats;
  }, [filteredSensors]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedSiteId("");
    setSelectedMachineId("");
    setSelectedStatus("");
  }, []);

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
      actionHref: "/settings/api-keys",
    },
    {
      label: "Send the first reading",
      done: hasReading,
      actionLabel: "How?",
      actionHref: "/docs",
    },
  ];

  return (
    <PageContainer wide>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: DISPLAY,
              fontVariationSettings: "'wdth' 120",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: "22px",
              letterSpacing: "0.01em",
              color: "var(--bone)",
              margin: 0,
            }}
          >
            <BarChart3 size={20} style={{ color: "var(--accent)" }} />
            Sensor Monitoring
          </h1>
          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              fontFamily: SANS,
              fontSize: "13px",
              color: "var(--fg-3)",
              maxWidth: "600px",
            }}
          >
            Inspect live and historical machine readings. Monitor sensor health,
            view trends, and navigate to related incidents.
          </p>
          <p
            style={{
              marginTop: "8px",
              fontFamily: MONO,
              fontSize: "10px",
              color: "var(--fg-4)",
            }}
          >
            Last refresh: {new Date().toLocaleTimeString([], { timeStyle: "short" })}
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

      {/* Sensor Summary Metrics */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatPill
          label="Sensors reporting"
          value={sensorStats.reporting}
          color="var(--sev-harmless)"
          loading={sensorsLoading}
        />
        <StatPill
          label="Stale or missing"
          value={sensorStats.stale + sensorStats.missing}
          color="var(--sev-minor)"
          loading={sensorsLoading}
        />
        <StatPill
          label="Abnormal readings"
          value={sensorStats.abnormal}
          color="var(--sev-serious)"
          loading={sensorsLoading}
        />
        <StatPill
          label="Machines covered"
          value={availableMachines.length}
          color="var(--accent)"
          loading={sensorsLoading}
        />
        <StatPill
          label="Total sensors"
          value={sensorStats.total}
          color="var(--fg-2)"
          loading={sensorsLoading}
        />
      </div>

      {/* Filter Toolbar */}
      <section
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "2px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              minWidth: "250px",
            }}
          >
            <Search size={16} style={{ color: "var(--fg-4)" }} />
            <input
              type="text"
              placeholder="Search by machine name, sensor, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                ...FIELD,
                fontSize: "12px",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              ...SECONDARY_BTN,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Filter size={14} />
            Filters
            {(selectedSiteId || selectedMachineId || selectedStatus) && (
              <span
                style={{
                  background: "var(--accent)",
                  color: "var(--bg-base)",
                  borderRadius: "2px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                Active
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!selectedSiteId && !selectedMachineId && !selectedStatus && !searchQuery}
            style={{
              ...SECONDARY_BTN,
              padding: "8px 12px",
              color: "var(--fg-4)",
              borderColor: "var(--border-hairline)",
            }}
          >
            <X size={14} />
            Reset
          </button>
        </div>

        {/* Filter dropdown */}
        {showFilters && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={LABEL}>Site</label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                style={FIELD}
              >
                <option value="">All sites</option>
                {(sites || []).map((site) => (
                  <option key={site._id} value={site._id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Machine</label>
              <select
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                style={FIELD}
                disabled={!availableMachines.length}
              >
                <option value="">All machines</option>
                {availableMachines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={FIELD}
              >
                <option value="">All statuses</option>
                <option value="ONLINE">Online</option>
                <option value="STALE">Stale</option>
                <option value="OFFLINE">Offline</option>
                <option value="WAITING">Waiting</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Machine readiness section */}
      <MachineReadinessSection
        machines={machineCoverages}
        isLoading={coveragesLoading}
      />

      {/* Main content area - Charts and Table */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "24px",
        }}
      >
        {/* Sensor Trends Chart Section */}
        {selectedMachineId && selectedMachineTrends.length > 0 && (
          <section
            style={{
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-hairline)",
                background: "var(--bg-surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--fg-3)",
                }}
              >
                Live Sensor Trends
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  color: "var(--fg-4)",
                }}
              >
                Auto-refreshes every 60s
              </span>
            </div>
            <div
              style={{
                padding: "16px",
                display: "grid",
                gap: "16px",
              }}
            >
              {selectedMachineTrends.map((series) => (
                <article
                  id={`sensor-${series.sensorId}`}
                  key={series.sensorId}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <h2
                      style={{
                        fontFamily: SANS,
                        fontSize: 15,
                        color: "var(--fg-1)",
                        margin: 0,
                      }}
                    >
                      {series.name}
                    </h2>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: "var(--dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      {series.type} · {series.unit || "unit not configured"}
                    </span>
                  </div>
                  <TrendChart series={series} />
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Sensor Table */}
        <section
          style={{
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border-hairline)",
              background: "var(--bg-surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--fg-3)",
              }}
            >
              All sensors
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: "var(--fg-4)",
              }}
            >
              {filteredSensors.length} of {sensorList.length} visible
            </span>
          </div>

          {sensorsLoading ? (
            <div
              style={{
                padding: "24px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--fg-3)",
                fontFamily: MONO,
                fontSize: "11px",
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : filteredSensors.length === 0 ? (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                borderTop: "1px solid var(--border-hairline)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: SANS,
                  fontSize: "13px",
                  color: "var(--fg-3)",
                }}
              >
                {searchQuery || selectedSiteId || selectedMachineId || selectedStatus
                  ? "No sensors match the current filters."
                  : "No sensors yet. Add your first sensor to start receiving readings."}
              </p>
              {!searchQuery && !selectedSiteId && !selectedMachineId && !selectedStatus && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  style={{
                    ...PRIMARY_BTN,
                    marginTop: "16px",
                  }}
                >
                  <Plus size={11} />
                  Add sensor
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Type",
                      "Machine",
                      "Site",
                      "Status",
                      "Last reading",
                      "Interval",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          fontFamily: MONO,
                          fontSize: "9px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "var(--fg-4)",
                          borderBottom: "1px solid var(--border-hairline)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSensors.map((s) => {
                    // Find incidents for this sensor
                    const sensorIncidents = incidents?.incidents?.filter(
                      (inc) =>
                        inc.sensorId === s._id ||
                        inc.machineId === s.machineId
                    ) || [];
                    const hasIncident = sensorIncidents.length > 0;

                    return (
                      <tr
                        key={s._id}
                        style={{
                          borderBottom: "1px solid var(--border-hairline)",
                        }}
                      >
                        <td style={TD}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            {hasIncident && (
                              <AlertTriangle
                                size={14}
                                style={{
                                  color: "var(--sev-serious)",
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td style={{ ...TD, color: "var(--fg-3)" }}>
                          {s.type}
                        </td>
                        <td style={{ ...TD, color: "var(--fg-3)" }}>
                          {s.machineName || s.machineId || "—"}
                        </td>
                        <td style={{ ...TD, color: "var(--fg-3)" }}>
                          {s.siteName || "—"}
                        </td>
                        <td style={TD}>
                          <StatusBadge status={s.status} />
                        </td>
                        <td
                          style={{
                            ...TD,
                            color: "var(--fg-3)",
                          }}
                        >
                          {s.lastReadingAt
                            ? relative(s.lastReadingAt)
                            : "—"}
                          {typeof s.ageSec === "number" && s.ageSec < 3600 ? (
                            <span
                              style={{
                                marginLeft: "6px",
                                color: "var(--fg-4)",
                              }}
                            >
                              ({s.ageSec}s ago)
                            </span>
                          ) : null}
                        </td>
                        <td style={{ ...TD, color: "var(--fg-3)" }}>
                          {formatInterval(s.expectedIntervalSec)}
                        </td>
                        <td
                          style={{
                            ...TD,
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.machineId && (
                            <Link
                              href={`/machines/${s.machineId}`}
                              style={{
                                ...SECONDARY_BTN,
                                fontSize: "10px",
                                padding: "4px 8px",
                              }}
                              title="View Machine"
                            >
                              <Eye size={10} />
                            </Link>
                          )}
                          {hasIncident && (
                            <Link
                              href={`/incidents?machineId=${s.machineId}&sensorId=${s._id}`}
                              style={{
                                ...SECONDARY_BTN,
                                fontSize: "10px",
                                padding: "4px 8px",
                                marginLeft: "4px",
                                color: "var(--sev-serious)",
                                borderColor: "var(--sev-serious)",
                              }}
                              title="View Incidents"
                            >
                              <AlertTriangle size={10} />
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditTarget(s)}
                            style={{
                              ...SECONDARY_BTN,
                              fontSize: "10px",
                              padding: "4px 8px",
                              marginLeft: "4px",
                            }}
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            style={{
                              ...DANGER_BTN,
                              fontSize: "10px",
                              padding: "4px 8px",
                              marginLeft: "4px",
                            }}
                          >
                            <Ban size={10} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} summary={summary} />
      <EditSensorDialog
        sensor={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <DeleteSensorDialog
        sensor={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </PageContainer>
  );
}
