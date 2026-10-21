import { redirect } from "next/navigation";

export default async function LegacyIncidentRedirect({ params }) {
  const { id } = await params;
  redirect(`/incidents/${id}`);
}
