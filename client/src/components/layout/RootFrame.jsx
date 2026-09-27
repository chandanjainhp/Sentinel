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
      {/* ≤640px the TopBar wraps to two rows (~100px); desktop stays 56px. */}
      {!suppressTopBar && (
        <style dangerouslySetInnerHTML={{ __html: `
          .app-main-offset { padding-top: 56px; }
          @media (max-width: 640px) {
            .app-main-offset { padding-top: 100px; }
          }
        ` }} />
      )}
      <div id={suppressTopBar ? undefined : "main"} className={suppressTopBar ? undefined : "app-main-offset"} style={{ paddingTop: suppressTopBar ? "0" : undefined }}>{children}</div>
    </>
  );
}
