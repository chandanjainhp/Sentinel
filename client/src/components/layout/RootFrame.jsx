"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";

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

  const suppressSidebar = isPublicRoute;

  return (
    <>
      {!suppressSidebar && <a href="#main" className="skip-to-content">Skip to content</a>}
      {!suppressSidebar && <Sidebar />}
      <main id={suppressSidebar ? undefined : "main"} className={suppressSidebar ? undefined : "app-layout-main"}>
        {children}
      </main>
    </>
  );
}
