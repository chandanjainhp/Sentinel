"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PageContainer from "@/components/layout/PageContainer";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import LoadingState from "@/components/shared/LoadingState";
import {
  createSite, deleteSite, getSites, updateSite,
} from "@/lib/api";

const inputClass = "h-10 w-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--border-focus)]";
const buttonClass = "inline-flex h-10 items-center justify-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--bg-base)] disabled:cursor-not-allowed disabled:opacity-50";

function SiteForm({ initial = {}, onSubmit, pending, onCancel }) {
  const [values, setValues] = useState({
    name: initial.name || "",
    description: initial.description || "",
    industry: initial.industry || "",
    timezone: initial.timezone || "UTC",
  });
  const [error, setError] = useState("");
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  function submit(event) {
    event.preventDefault();
    const name = values.name.trim();
    if (name.length < 2 || name.length > 120) {
      setError("Site name must be between 2 and 120 characters.");
      return;
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: values.timezone.trim() });
    } catch {
      setError("Timezone must be a valid IANA timezone, such as UTC or America/New_York.");
      return;
    }
    if (values.description.trim().length > 500 || values.industry.trim().length > 100) {
      setError("Description must be 500 characters or fewer and industry 100 or fewer.");
      return;
    }
    setError("");
    onSubmit({ ...values, name, description: values.description.trim(), industry: values.industry.trim() });
  }
  return (
    <form onSubmit={submit} className="grid gap-4 border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-5 md:grid-cols-2">
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Name *
        <input aria-label="Site name" className={`${inputClass} mt-2`} value={values.name} onChange={change("name")} required maxLength={120} />
      </label>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Timezone
        <input aria-label="Site timezone" className={`${inputClass} mt-2`} value={values.timezone} onChange={change("timezone")} required />
      </label>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Industry
        <input aria-label="Site industry" className={`${inputClass} mt-2`} value={values.industry} onChange={change("industry")} maxLength={100} />
      </label>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Description
        <input aria-label="Site description" className={`${inputClass} mt-2`} value={values.description} onChange={change("description")} maxLength={500} />
      </label>
      {error && <p role="alert" className="font-mono text-[11px] text-[var(--sev-serious)] md:col-span-2">{error}</p>}
      <div className="flex gap-2 md:col-span-2">
        <button className={buttonClass} disabled={pending}>{pending ? "Saving…" : "Save site"}</button>
        {onCancel && <button type="button" className="h-10 border border-[var(--border-default)] px-4 font-mono text-[10px] uppercase text-[var(--fg-2)]" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function SitesPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const sites = useQuery({ queryKey: ["sites"], queryFn: getSites });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sites"] });
  const create = useMutation({ mutationFn: createSite, onSuccess: () => { refresh(); setCreating(false); toast.success("Site created"); }, onError: (error) => toast.error(error?.message || "Could not create site") });
  const edit = useMutation({ mutationFn: ({ id, data }) => updateSite(id, data), onSuccess: () => { refresh(); setEditing(null); toast.success("Site updated"); }, onError: (error) => toast.error(error?.message || "Could not update site") });
  const remove = useMutation({ mutationFn: deleteSite, onSuccess: () => { refresh(); setDeleting(null); toast.success("Site deleted"); }, onError: (error) => toast.error(error?.message || "Could not delete site") });

  return (
    <PageContainer wide>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-4)]">Workspace</p><h1 className="mt-2 text-2xl font-semibold text-[var(--fg-1)]">Sites</h1><p className="mt-1 text-sm text-[var(--fg-3)]">Manage monitored facilities and their machine fleets.</p></div>
        <button className={buttonClass} onClick={() => { setCreating((value) => !value); setEditing(null); }}><Plus size={14} /> Create site</button>
      </div>
      {creating && <div className="mb-6"><SiteForm onSubmit={(data) => create.mutate(data)} pending={create.isPending} onCancel={() => setCreating(false)} /></div>}
      {sites.isLoading && <LoadingState variant="skeleton" />}
      {sites.isError && <ErrorState error={sites.error} onRetry={sites.refetch} />}
      {!sites.isLoading && !sites.isError && sites.data?.length === 0 && <EmptyState title="No sites yet" description="Create a site before adding machines or sensors." action={{ label: "Create site", onClick: () => setCreating(true) }} />}
      {!sites.isLoading && !sites.isError && sites.data?.length > 0 && (
        <div className="grid gap-3">
          {sites.data.map((site) => (
            <article key={site._id} className="border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-5">
              {editing?._id === site._id ? <SiteForm initial={site} pending={edit.isPending} onCancel={() => setEditing(null)} onSubmit={(data) => edit.mutate({ id: site._id, data })} /> : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><Link href={`/sites/${site._id}`} className="text-lg font-semibold text-[var(--fg-1)] hover:text-[var(--accent)]">{site.name}</Link><p className="mt-1 text-sm text-[var(--fg-3)]">{site.description || site.industry || "No description provided"}</p><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-4)]">{site.timezone || "UTC"} · {site.status || "active"}</p></div>
                  <div className="flex gap-2"><button aria-label={`Edit ${site.name}`} className="border border-[var(--border-default)] p-2 text-[var(--fg-3)] hover:text-[var(--fg-1)]" onClick={() => setEditing(site)}><Pencil size={14} /></button><button aria-label={`Delete ${site.name}`} className="border border-[var(--border-default)] p-2 text-[var(--sev-serious)]" onClick={() => setDeleting(site)}><Trash2 size={14} /></button></div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)} title={`Delete ${deleting?.name || "site"}?`} description="This request is sent to the backend. If the site has dependent records and the backend rejects deletion, no local record will be removed." resourceLabel={deleting?.name} confirmLabel="Delete site" isLoading={remove.isPending} onConfirm={() => remove.mutate(deleting._id)} />
    </PageContainer>
  );
}
