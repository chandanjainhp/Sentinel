import axios from "axios";
import { toast } from "sonner";

const getApiBaseUrl = () => {
  // In the browser, always use same-origin API paths so Next rewrites/proxy handle routing.
  if (typeof window !== "undefined") {
    return "/api/v1";
  }

  // SSR / Node only — never reaches the browser bundle's request path.
  const upstream =
    process.env.API_UPSTREAM_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  return `${upstream}/api/v1`;
};

const API_BASE_URL = getApiBaseUrl();
const SHOULD_LOG_API =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_API === "1";

/* =========================================
     SESSION HELPERS & ERROR TYPES
========================================= */

const hasAuthCookie = () => {
  if (typeof window === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("ridgeway_auth=1"));
};

export const getStoredToken = () => null;

export const setStoredToken = () => {};

export const clearStoredToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("ridgeway_user");
    document.cookie = "ridgeway_auth=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "ridgeway_setup=; path=/; max-age=0; SameSite=Lax";
  }
};

const clearClientAuthSession = () => {
  clearStoredToken();
  if (typeof window !== "undefined") {
    document.cookie = "ridgeway_auth=; path=/; max-age=0; SameSite=Lax";
  }
};

// Error type constants for client-side error handling
export const ERROR_TYPES = {
  NETWORK_ERROR: "NETWORK_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
};

/* =========================================
     AXIOS INSTANCE & INTERCEPTORS
========================================= */

// Instantiate the core instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30s timeout explicitly requested due to heavy agent computation
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

if (SHOULD_LOG_API && typeof window !== "undefined") {
  console.info("[API] baseURL", API_BASE_URL || "(same-origin)/api/v1");
}

// Token refresh state management
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Auth uses httpOnly cookies — withCredentials sends them automatically.
api.interceptors.request.use((config) => {
  if (SHOULD_LOG_API && typeof window !== "undefined") {
    const method = (config.method || "GET").toUpperCase();
    console.info("[API] request", method, config.baseURL + config.url);
  }
  return config;
});

// Automatically peel back ApiResponse wrapper layers or normalize error streams.
api.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === "object" &&
      "data" in response.data
    ) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    const statusCode = error.response?.status;
    const method = (originalRequest?.method || "UNKNOWN").toUpperCase();
    const url = `${originalRequest?.baseURL || ""}${originalRequest?.url || ""}` || "(unknown-url)";
    const isNetworkFailure = !error.response;
    const message =
      error.response?.data?.message ||
      (isNetworkFailure
        ? `Network error while contacting API at ${url}. Check server availability and client API proxy configuration.`
        : error.message) ||
      "An unknown error occurred";
    const errors =
      error.response?.data?.errors ||
      (Array.isArray(error.response?.data?.data) ? error.response.data.data : []);

    if (SHOULD_LOG_API && typeof window !== "undefined") {
      const isClientError = statusCode >= 400 && statusCode < 500;
      const log = isClientError ? console.warn : console.error;
      log(`[API] ${method} ${url} ${statusCode ?? "NO_STATUS"}: ${message}`, {
        method,
        url,
        statusCode,
        message,
        code: error?.code,
        name: error?.name,
        isAxiosError: Boolean(error?.isAxiosError),
        details: errors,
      });
    }

    // Determine error type
    let errorType = ERROR_TYPES.NETWORK_ERROR;
    if (statusCode === 401) errorType = ERROR_TYPES.UNAUTHORIZED;
    else if (statusCode === 403) errorType = ERROR_TYPES.FORBIDDEN;
    else if (statusCode === 404) errorType = ERROR_TYPES.NOT_FOUND;
    else if (statusCode === 400 && Array.isArray(errors) && errors.length > 0)
      errorType = ERROR_TYPES.VALIDATION_ERROR;
    else if (statusCode >= 500) errorType = ERROR_TYPES.SERVER_ERROR;

    // Network error: toast + retry once after 5s
    if (isNetworkFailure && !originalRequest._retried && typeof window !== "undefined") {
      originalRequest._retried = true;
      toast.error("Connection lost. Trying to reconnect…");
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          api.request(originalRequest).then(resolve).catch(reject);
        }, 5000);
      });
    }

    // Check if response has 'data' property (ApiResponse wrapper)
    const responseData = error.response?.data?.data || error.response?.data;

    // Second 401 means the refresh itself failed — clear session and redirect.
    if (statusCode === 401 && originalRequest._retry) {
      clearClientAuthSession();
      if (typeof window !== "undefined") {
        const isSessionEnded = message.toLowerCase().includes('invalidated') || message.toLowerCase().includes('expired');
        window.location.href = `/login?reason=${isSessionEnded ? 'session_ended' : 'expired'}`;
      }
      const expiredError = new Error("Session expired — please log in again");
      expiredError.type = ERROR_TYPES.UNAUTHORIZED;
      expiredError.statusCode = 401;
      throw expiredError;
    }

    // Attempt token refresh on 401 (only if not already retrying)
    if (statusCode === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => {
            const enrichedError = new Error(message);
            enrichedError.type = errorType;
            enrichedError.statusCode = statusCode;
            enrichedError.errors = errors;
            throw enrichedError;
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      if (!hasAuthCookie()) {
        processQueue(new Error("No active session"), null);
        isRefreshing = false;
        clearClientAuthSession();
        if (typeof window !== "undefined") {
          window.location.href = "/login?reason=session_ended";
        }
        const enrichedError = new Error("Session ended — please log in again");
        enrichedError.type = ERROR_TYPES.UNAUTHORIZED;
        enrichedError.statusCode = 401;
        throw enrichedError;
      }

      try {
        await api.post("/auth/refresh-token", {});
        processQueue(null, true);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearClientAuthSession();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        const enrichedError = new Error("Failed to refresh session");
        enrichedError.type = ERROR_TYPES.UNAUTHORIZED;
        enrichedError.statusCode = 401;
        throw enrichedError;
      } finally {
        isRefreshing = false;
      }
    }

    // Attach error type information and throw enriched error
    const enrichedError = new Error(message);
    enrichedError.type = errorType;
    enrichedError.statusCode = statusCode;
    enrichedError.errors = errors;
    throw enrichedError;
  }
);

/* =========================================
             EXPORTED API CALLS
========================================= */

// Authentication
export const loginUser = async (email, password) =>
  api.post("/auth/login", { email, password });

export const getCurrentUser = async () => api.get("/auth/current-user");

export const changePassword = async ({ currentPassword, oldPassword, newPassword }) =>
  api.post("/auth/change-password", {
    oldPassword: oldPassword || currentPassword,
    newPassword,
  });

export const registerUser = async ({ email, username, password }) =>
  api.post("/auth/register", { email, username, password });

export const verifyEmail = async (otp) => api.post("/auth/verify-email", { otp });

export const forgotPassword = async (email) => api.post("/auth/forgot-password", { email });

export const resetPassword = async (otp, newPassword) => api.post("/auth/reset-password", { otp, newPassword });

export const resendEmailVerification = async () => api.post("/auth/resend-email-verification");

export const logoutUser = async () => {
  try {
    await api.post("/auth/logout");
  } finally {
    clearStoredToken();
  }
};

export const refreshAccessToken = async () =>
  api.post("/auth/refresh-token", {});

// Investigations
export const startInvestigation = async (nightDate) =>
  api.post("/investigations/start", { nightDate });
export const getInvestigation = async (id) => api.get(`/investigations/${id}`);

// Events
export const getEventsForNight = async (nightDate) => api.get(`/events`, { params: { nightDate } });
export const getEventById = async (id) => api.get(`/events/${id}`);

// Incidents
export const getIncidents = async ({
  nightDate,
  status,
  severity,
  workPackageId,
  assetId,
} = {}) =>
  api.get(`/incidents`, {
    params: { nightDate, status, severity, workPackageId, assetId },
  });
export const getIncidentById = async (id) => api.get(`/incidents/${id}`);
export const getIncidentEvidenceGraph = async (id) => api.get(`/incidents/${id}/graph`);

// Briefing
export const getLatestBriefing = async (nightDate) => api.get(`/briefings/latest`, { params: { nightDate } });
export const updateBriefingSection = async (briefingId, { sectionName, content }) =>
  api.patch(`/briefings/${briefingId}/sections/${sectionName}`, { content });
export const approveBriefing = async (briefingId) => api.post(`/briefings/${briefingId}/approve`);

// Settings — single API key per user
export const getApiKeyMeta = () => api.get("/settings/api-key");
export const createUserApiKey = () => api.post("/settings/api-key");
export const revokeUserApiKey = () => api.delete("/settings/api-key");

// Sensors
export const getSites = () => api.get("/sites");
export const createSite = (data) => api.post("/sites", data);
export const getSensorSummary = () => api.get("/sensors/summary");
export const listSensors = () => api.get("/sensors");
export const createSensor = (machineId, data) =>
  api.post(`/sensors/machines/${machineId}/sensors`, data);
export const updateSensor = (sensorId, data) => api.patch(`/sensors/${sensorId}`, data);
export const deleteSensor = (sensorId) => api.delete(`/sensors/${sensorId}`);
export const getMachinesForSite = (siteId) => api.get(`/machines/sites/${siteId}/machines`);
export const createMachine = (siteId, data) =>
  api.post(`/machines/sites/${siteId}/machines`, data);

// Site Webhooks
export const getOrgWebhooks = () => api.get("/site/webhooks/config");
export const getWebhookConfig = () => api.get("/site/webhooks/config");
export const updateWebhookConfig = (data) => api.put("/site/webhooks/config", data);
export const getWebhookDeliveries = (params) => api.get("/site/webhooks/deliveries", { params });
export const testWebhook = () => api.post("/site/webhooks/test");
export const rotateWebhookSecret = () => api.post("/site/webhooks/rotate-secret");
export const retryWebhookDelivery = (id) => api.post(`/site/webhooks/deliveries/${id}/retry`);

// Legacy single-site helpers used by the settings pages. The org config they
// originally targeted was removed in the single-user pivot; they now resolve
// the user's first site and split webhook fields onto the webhook config API.
export const getSite = async () => {
  const sites = await api.get("/sites");
  const first = Array.isArray(sites) ? sites[0] : sites;
  return first ?? null;
};

export const updateSiteConfig = async (payload = {}) => {
  const { name, timezone, webhookUrl, webhookActive } = payload;
  const updates = [];
  if (name !== undefined || timezone !== undefined) {
    const sites = await api.get("/sites");
    const site = Array.isArray(sites) ? sites[0] : null;
    if (site) {
      updates.push(
        api.patch(`/sites/${site._id}`, {
          ...(name !== undefined ? { name } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
        })
      );
    }
  }
  if (webhookUrl !== undefined || webhookActive !== undefined) {
    updates.push(
      updateWebhookConfig({
        ...(webhookUrl !== undefined ? { webhookUrl } : {}),
        ...(webhookActive !== undefined ? { webhookActive } : {}),
      })
    );
  }
  await Promise.all(updates);
  return null;
};

export default api;
