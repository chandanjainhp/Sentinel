"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { ERROR_TYPES } from "@/lib/api";

export default function Providers({ children }) {
  // Create QueryClient instance once per session
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
            retry: (failureCount, error) => {
              // Never retry auth failures; interceptor already handles refresh + redirect.
              if (error?.statusCode === 401 || error?.statusCode === 403) {
                return false;
              }
              return failureCount < 1;
            },
            retryDelay: (attemptIndex) => {
              // Use exponential backoff: 100ms, 300ms, 900ms
              return Math.min(1000 * 2 ** attemptIndex, 30000);
            },
            refetchOnWindowFocus: false, // Maya is focused on this screen
            onError: (error) => {
              // Handle unauthorized errors globally
              if (error?.type === ERROR_TYPES.UNAUTHORIZED) {
                // Middleware will handle redirect on next request
              }
            },
          },
          mutations: {
            retry: 0, // Don't retry mutations automatically
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Sonner toaster for notifications */}
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        closeButton
      />
    </QueryClientProvider>
  );
}
