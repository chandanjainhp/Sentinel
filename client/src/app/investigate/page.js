"use client";

import { redirect } from "next/navigation";

export default function InvestigatePage() {
  redirect("/incidents");
  return null;
}
