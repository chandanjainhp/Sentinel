"use client";

import { usePathname } from "next/navigation";
import TopBar from "@/components/layout/TopBar";

const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/register",
  "/opt",
  "/docs",
  "/forgot-password",
  "/reset-password",
]);

export default function RootFrame({ children }) {
  const pathname = usePathname();
  const path = pathname || "";
  const isPublicRoute =
    PUBLIC_ROUTES.has(path) ||
    path.startsWith("/reset-password");

  const suppressTopBar = isPublicRoute;

  return (
    <>
      {!suppressTopBar && <a href="#main" className="skip-to-content">Skip to content</a>}
      {!suppressTopBar ? <TopBar /> : null}
      <div id={suppressTopBar ? undefined : "main"} style={{ paddingTop: suppressTopBar ? "0" : "56px" }}>{children}</div>
    </>
  );
}
