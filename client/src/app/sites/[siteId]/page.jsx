"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import PageContainer from "@/components/layout/PageContainer";
import ErrorState from "@/components/shared/ErrorState";
import LoadingState from "@/components/shared/LoadingState";
import { getSiteById, getMachinesForSite } from "@/lib/api";

export default function SiteDetailPage() {
  const { siteId } = useParams();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => getSiteById(siteId), enabled: Boolean(siteId) });
  const machines = useQuery({ queryKey: ["machines", siteId], queryFn: () => getMachinesForSite(siteId), enabled: Boolean(siteId) });
  if (site.isLoading) return <PageContainer><LoadingState variant="block" /></PageContainer>;
  if (site.isError) return <PageContainer><ErrorState error={site.error} onRetry={site.refetch} /></PageContainer>;
  return <PageContainer><Link href="/sites" className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-4)]">← Sites</Link><h1 className="mt-4 text-2xl font-semibold text-[var(--fg-1)]">{site.data.name}</h1><p className="mt-2 text-sm text-[var(--fg-3)]">{site.data.description || "No description provided"} · {site.data.timezone || "UTC"}</p><h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--fg-2)]">Machines</h2>{machines.isLoading ? <LoadingState /> : machines.isError ? <ErrorState error={machines.error} onRetry={machines.refetch} /> : machines.data?.length ? <div className="mt-3 grid gap-2">{machines.data.map((machine) => <Link key={machine._id} href={`/machines/${machine._id}`} className="border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-4 text-[var(--fg-1)] hover:border-[var(--accent)]">{machine.name}<span className="ml-3 font-mono text-[10px] uppercase text-[var(--fg-4)]">{machine.machineType}</span></Link>)}</div> : <p className="mt-3 text-sm text-[var(--fg-3)]">No machines are associated with this site.</p>}</PageContainer>;
}
