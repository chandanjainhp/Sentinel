import { redirect } from "next/navigation";

export default function LegacyGeneralSettingsRoute() {
  redirect("/settings/api-keys");
}
