"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  loginUser,
  registerUser,
  logoutUser,
  refreshAccessToken,
  clearStoredToken,
  ERROR_TYPES,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

function clearAuthCookies() {
  if (typeof window === "undefined") return;
  document.cookie = `ridgeway_auth=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `ridgeway_role=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `ridgeway_setup=; path=/; max-age=0; SameSite=Lax`;
}

function hasAuthCookie() {
  if (typeof window === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("ridgeway_auth=1"));
}

export function useAuth() {
  const router = useRouter();
  const { setUser, clearUser } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }) => loginUser(email, password),
    onSuccess: async (data) => {
      if (data?.user) {
        localStorage.setItem("ridgeway_user", JSON.stringify(data.user));
        setUser(data.user);
      }

      if (typeof window !== "undefined") {
        document.cookie = `ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax`;
      }

      toast.success("Welcome back");
      router.replace("/overview");
    },
    onError: (error) => {
      if (error.type === ERROR_TYPES.UNAUTHORIZED) {
        toast.error("Invalid email or password");
      } else {
        toast.error("Login failed — please try again");
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSuccess: () => {
      localStorage.removeItem("ridgeway_user");
      clearUser();
      clearAuthCookies();
      router.replace("/");
      toast.info("Logged out");
    },
    onError: () => {
      clearStoredToken();
      localStorage.removeItem("ridgeway_user");
      clearUser();
      clearAuthCookies();
      router.replace("/");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (userData) => registerUser(userData),
    onSuccess: (data) => {
      if (data?.user) {
        localStorage.setItem("ridgeway_user", JSON.stringify(data.user));
        setUser(data.user);
      }
      if (typeof window !== "undefined") {
        document.cookie = `ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax`;
      }
      toast.success("Account created successfully!");
      router.replace("/overview");
    },
    onError: (error) => {
      toast.error(error.message || "Registration failed");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => refreshAccessToken(),
    onError: () => {
      clearStoredToken();
      router.replace("/");
    },
  });

  return {
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    register: registerMutation.mutate,
    refreshToken: refreshMutation.mutate,
    isAuthenticated: hasAuthCookie(),
    isLoading:
      loginMutation.isPending ||
      logoutMutation.isPending ||
      registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    refreshError: refreshMutation.error,
    loginMutation,
    logoutMutation,
    registerMutation,
    refreshMutation,
  };
}
