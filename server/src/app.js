import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { httpLogger } from './utils/logger.js';
import { apiLimiter } from './middlewares/rateLimit.middleware.js';
import { csrfProtection } from './middlewares/csrf.middleware.js';
import { metricsMiddleware } from './middlewares/metrics.middleware.js';
import { securityMiddleware } from './middlewares/security.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

import healthCheckRouter from './routes/healthcheck.routes.js';
import authRouter from './routes/auth.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import siteRoutes from "./routes/site.routes.js";
import machineRoutes from "./routes/machine.routes.js";
import sensorRoutes from "./routes/sensor.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import eventRoutes from "./routes/event.routes.js";
import predictionRoutes from "./routes/prediction.routes.js";
import incidentRoutes from "./routes/incident.routes.js";
import investigationRoutes from "./routes/investigation.routes.js";
import briefingRoutes from "./routes/briefing.routes.js";
import overnightHealthRoutes from "./routes/overnight-health.routes.js";
import onboardingRoutes from "./routes/onboarding.routes.js";
import testRoutes from "./routes/test.routes.js";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// MIDDLEWARE ORDER
// 1. Security headers (helmet + custom CSP, HSTS, etc.)
app.use(securityMiddleware);

// 2. CORS
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. NoSQL injection sanitisation
app.use(mongoSanitize());

// 4. Body parsing
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Request logger
app.use(httpLogger);

// 6. Metrics collection — must be early to capture full request lifecycle
app.use(metricsMiddleware);

// 7. Global rate limiter — skip health + event ingestion + metrics
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/health')) return next();
  if (req.path.startsWith('/api/v1/metrics')) return next();
  if (req.method === 'POST' && req.path.startsWith('/api/v1/events')) return next();
  return apiLimiter(req, res, next);
});

// 8. CSRF protection for state-changing requests with cookie auth
app.use(csrfProtection);

// ROUTE MOUNTING (all under /api/v1)
app.use('/api/v1/health', healthCheckRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/auth', authRouter);
app.use("/api/v1/sites", siteRoutes);
app.use("/api/v1/machines", machineRoutes);
app.use("/api/v1/sensors", sensorRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/predictions", predictionRoutes);
app.use("/api/v1/incidents", incidentRoutes);
app.use("/api/v1/investigations", investigationRoutes);
app.use("/api/v1/briefings", briefingRoutes);
app.use("/api/v1/overnight-health", overnightHealthRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);

// Metrics endpoint - restricted access, Prometheus-compatible
// Mount path can be customized via METRICS_PATH environment variable
const metricsPath = process.env.METRICS_PATH || '/api/v1/metrics';
import { metricsHandler } from './middlewares/metrics.middleware.js';
app.get(metricsPath, metricsHandler);

// DEVELOPMENT ONLY — test routes. Never mounted in production: the seed
// helper must not exist on a deployed instance.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/test', testRoutes);
  console.log('[app] ⚠ Test routes mounted at /api/v1/test (dev only)');
}

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error middleware (MUST be last)
app.use(errorHandler);

export default app;
