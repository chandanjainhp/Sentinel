"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import PageContainer from "@/components/layout/PageContainer";
import { getSite, updateSiteConfig } from "@/lib/api";

const inputStyle = {
  width: "100%",
  padding: "9px 10px",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--fg-1)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
};

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

export default function IncidentConfigurationPage() {
  const queryClient = useQueryClient();
  const { data: site, isLoading, isError } = useQuery({ queryKey: ["site-me"], queryFn: getSite });
  const [form, setForm] = useState({
    timezone: "UTC",
    monitoringStartTime: "00:00",
    monitoringEndTime: "12:00",
    monitoringEnabled: true,
  });

  useEffect(() => {
    if (!site) return;
    setForm({
      timezone: site.timezone || "UTC",
      monitoringStartTime: site.monitoringStartTime || "00:00",
      monitoringEndTime: site.monitoringEndTime || "09:00",
      monitoringEnabled: site.monitoringEnabled !== false,
    });
  }, [site]);

  const save = useMutation({
    mutationFn: updateSiteConfig,
    onSuccess: () => {
      toast.success("Incident monitoring configuration saved");
      queryClient.invalidateQueries({ queryKey: ["site-me"] });
    },
    onError: (error) => toast.error(error?.message || "Could not save configuration"),
  });

  if (isLoading) return <PageContainer>Loading incident configuration…</PageContainer>;
  if (isError || !site) return <PageContainer>Could not load incident configuration.</PageContainer>;

  const set = (key) => (event) => setForm((current) => ({
    ...current,
    [key]: key === "monitoringEnabled" ? event.target.checked : event.target.value,
  }));

  return (
    <PageContainer>
      <header style={{ marginBottom: 24 }}>
        <div style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Operations · Automated monitoring
        </div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 0", color: "var(--bone)", fontSize: 30, textTransform: "uppercase" }}>
          <CalendarClock size={24} color="var(--accent)" /> Incident Configuration
        </h1>
        <p style={{ maxWidth: 620, color: "var(--fg-3)", fontSize: 13, lineHeight: 1.55 }}>
          Sentinel runs health checks and generates incident reports automatically during this window. No manual investigation start is required.
        </p>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); save.mutate(form); }} style={{ maxWidth: 640, display: "grid", gap: 18, padding: 20, border: "1px solid var(--border-default)", background: "var(--bg-surface-1)" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase" }}>Site time zone</span>
          <select required value={form.timezone} onChange={set("timezone")} style={inputStyle}>
            {!TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
            {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase" }}>Start time</span>
            <input required type="time" value={form.monitoringStartTime} onChange={set("monitoringStartTime")} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase" }}>End time</span>
            <input required type="time" value={form.monitoringEndTime} onChange={set("monitoringEndTime")} style={inputStyle} />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-2)", fontSize: 13 }}>
          <input type="checkbox" checked={form.monitoringEnabled} onChange={set("monitoringEnabled")} />
          Enable automated incident monitoring
        </label>
        <button type="submit" disabled={save.isPending} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", border: 0, borderRadius: 2, background: "var(--accent)", color: "var(--bg-base)", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", cursor: "pointer" }}>
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save configuration
        </button>
      </form>
    </PageContainer>
  );
}
