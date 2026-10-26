import { redirect } from "next/navigation";

export default function LegacyWebhooksRoute() {
  redirect("/settings/api-keys");
}
