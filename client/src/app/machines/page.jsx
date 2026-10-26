"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PageContainer from "@/components/layout/PageContainer";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import LoadingState from "@/components/shared/LoadingState";
import {
  createMachine, deleteMachine, getMachinesForSite, getSites, updateMachine,
} from "@/lib/api";

const inputClass = "h-10 w-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--border-focus)]";
const buttonClass = "inline-flex h-10 items-center justify-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--bg-base)] disabled:cursor-not-allowed disabled:opacity-50";

async function loadFleet() {
  const sites = await getSites();
  const groups = await Promise.all(sites.map(async (site) => (getMachinesForSite(site._id)).then((machines) => machines.map((machine) => ({ ...machine, site })))));
  return { sites, machines: groups.flat() };
}

function MachineForm({ sites, initial = {}, onSubmit, pending, onCancel }) {
  const [values, setValues] = useState({ siteId: initial.site?._id || initial.siteId || "", assetId: initial.assetId || "", name: initial.name || "", machineType: initial.machineType || "motor", manufacturer: initial.manufacturer || "", model: initial.model || "", serialNumber: initial.serialNumber || "", location: initial.location || "", zone: initial.zone || "" });
  const [error, setError] = useState("");
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  function submit(event) {
    event.preventDefault();
    if (!values.siteId && !initial._id) return setError("Choose a site.");
    if (values.assetId.trim().length < 1 || values.name.trim().length < 2 || values.machineType.trim().length < 1) return setError("Asset ID, name, and machine type are required.");
    if ([["manufacturer", 100], ["model", 100], ["serialNumber", 100], ["location", 200], ["zone", 100]].some(([key, max]) => values[key].trim().length > max)) return setError("One of the optional fields exceeds its maximum length.");
    setError("");
    const { siteId, ...data } = values;
    onSubmit({ siteId, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.trim()])) });
  }
  return <form onSubmit={submit} className="grid gap-4 border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-5 md:grid-cols-2">
    {!initial._id && <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Site *<select aria-label="Machine site" className={`${inputClass} mt-2`} value={values.siteId} onChange={change("siteId")}><option value="">Select site</option>{sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}</select></label>}
    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Asset ID *<input aria-label="Asset ID" className={`${inputClass} mt-2`} value={values.assetId} onChange={change("assetId")} maxLength={100} required /></label>
    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Name *<input aria-label="Machine name" className={`${inputClass} mt-2`} value={values.name} onChange={change("name")} maxLength={120} required /></label>
    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">Machine type *<input aria-label="Machine type" className={`${inputClass} mt-2`} value={values.machineType} onChange={change("machineType")} maxLength={100} required /></label>
    {["manufacturer", "model", "serialNumber", "location", "zone"].map((key) => <label key={key} className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-3)]">{key}<input aria-label={key} className={`${inputClass} mt-2`} value={values[key]} onChange={change(key)} /></label>)}
    {error && <p role="alert" className="font-mono text-[11px] text-[var(--sev-serious)] md:col-span-2">{error}</p>}
    <div className="flex gap-2 md:col-span-2"><button className={buttonClass} disabled={pending}>{pending ? "Saving…" : "Save machine"}</button>{onCancel && <button type="button" className="h-10 border border-[var(--border-default)] px-4 font-mono text-[10px] uppercase text-[var(--fg-2)]" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}

export default function MachinesPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const fleet = useQuery({ queryKey: ["machines-fleet"], queryFn: loadFleet });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["machines-fleet"] }); queryClient.invalidateQueries({ queryKey: ["machines"] }); };
  const create = useMutation({ mutationFn: ({ siteId, ...data }) => createMachine(siteId, data), onSuccess: () => { refresh(); setCreating(false); toast.success("Machine created"); }, onError: (error) => toast.error(error?.message || "Could not create machine") });
  const edit = useMutation({ mutationFn: ({ id, data }) => updateMachine(id, data), onSuccess: () => { refresh(); setEditing(null); toast.success("Machine updated"); }, onError: (error) => toast.error(error?.message || "Could not update machine") });
  const remove = useMutation({ mutationFn: deleteMachine, onSuccess: () => { refresh(); setDeleting(null); toast.success("Machine deleted"); }, onError: (error) => toast.error(error?.message || "Could not delete machine") });
  const machines = useMemo(() => (fleet.data?.machines || []).filter((machine) => (!siteFilter || machine.site?._id === siteFilter) && (!search || `${machine.name} ${machine.assetId} ${machine.machineType}`.toLowerCase().includes(search.toLowerCase()))), [fleet.data, search, siteFilter]);

  return <PageContainer wide>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-4)]">Workspace</p><h1 className="mt-2 text-2xl font-semibold text-[var(--fg-1)]">Machines</h1><p className="mt-1 text-sm text-[var(--fg-3)]">Manage assets and open their live health detail.</p></div><button className={buttonClass} onClick={() => setCreating((value) => !value)}><Plus size={14} /> Create machine</button></div>
    {creating && <div className="mb-6">{fleet.data?.sites?.length ? <MachineForm sites={fleet.data.sites} onSubmit={(data) => create.mutate(data)} pending={create.isPending} onCancel={() => setCreating(false)} /> : <p className="border border-[var(--border-default)] p-4 text-sm text-[var(--fg-3)]">Create a site before adding a machine.</p>}</div>}
    {fleet.isLoading && <LoadingState variant="skeleton" />}
    {fleet.isError && <ErrorState error={fleet.error} onRetry={fleet.refetch} />}
    {!fleet.isLoading && !fleet.isError && fleet.data?.sites?.length > 0 && <div className="mb-4 flex flex-wrap gap-3"><input aria-label="Search machines" className={`${inputClass} max-w-sm`} placeholder="Search machines…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter machines by site" className={`${inputClass} max-w-xs`} value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}><option value="">All sites</option>{fleet.data.sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}</select></div>}
    {!fleet.isLoading && !fleet.isError && fleet.data?.machines?.length === 0 && <EmptyState title="No machines yet" description="Create a machine and associate it with a site." action={{ label: "Create machine", onClick: () => setCreating(true) }} />}
    {!fleet.isLoading && !fleet.isError && machines.length > 0 && <div className="grid gap-3">{machines.map((machine) => <article key={machine._id} className="border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-5">{editing?._id === machine._id ? <MachineForm sites={fleet.data.sites} initial={machine} onSubmit={({ siteId, ...data }) => edit.mutate({ id: machine._id, data })} pending={edit.isPending} onCancel={() => setEditing(null)} /> : <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/machines/${machine._id}`} className="text-lg font-semibold text-[var(--fg-1)] hover:text-[var(--accent)]">{machine.name}</Link><p className="mt-1 text-sm text-[var(--fg-3)]">{machine.site?.name || "Unknown site"} · {machine.machineType} · {machine.assetId}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-4)]">{machine.status || "unknown"}{machine.location ? ` · ${machine.location}` : ""}</p></div><div className="flex gap-2"><button aria-label={`Edit ${machine.name}`} className="border border-[var(--border-default)] p-2 text-[var(--fg-3)]" onClick={() => setEditing(machine)}><Pencil size={14} /></button><button aria-label={`Delete ${machine.name}`} className="border border-[var(--border-default)] p-2 text-[var(--sev-serious)]" onClick={() => setDeleting(machine)}><Trash2 size={14} /></button></div></div>}</article>)}</div>}
    {!fleet.isLoading && !fleet.isError && fleet.data?.machines?.length > 0 && machines.length === 0 && <EmptyState title="No matching machines" description="Try another search or site filter." />}
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)} title={`Delete ${deleting?.name || "machine"}?`} description="The backend decides whether attached sensors or incidents allow deletion. Failed requests remain visible and are shown as errors." resourceLabel={deleting?.name} confirmLabel="Delete machine" isLoading={remove.isPending} onConfirm={() => remove.mutate(deleting._id)} />
  </PageContainer>;
}
