import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { httpLogger } from './utils/logger.js';
import { apiLimiter } from './middlewares/rateLimit.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

import healthCheckRouter from './routes/healthcheck.routes.js';
import authRouter from './routes/auth.routes.js';
import siteRoutes from "./routes/site.routes.js";
import machineRoutes from "./routes/machine.routes.js";
import sensorRoutes from "./routes/sensor.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import eventRoutes from "./routes/event.routes.js";
import predictionRoutes from "./routes/prediction.routes.js";
import incidentRoutes from "./routes/incident.routes.js";
import testRoutes from "./routes/test.routes.js";

const app = express();

// MIDDLEWARE ORDER
// 1. Security headers
app.use(helmet());

// 2. CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
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

// 6. Global rate limiter — skip health + event ingestion
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/health')) return next();
  if (req.method === 'POST' && req.path.startsWith('/api/v1/events')) return next();
  return apiLimiter(req, res, next);
});

// ROUTE MOUNTING (all under /api/v1)
app.use('/api/v1/health', healthCheckRouter);
app.use('/api/v1/auth', authRouter);
app.use("/api/v1/sites", siteRoutes);
app.use("/api/v1/machines", machineRoutes);
app.use("/api/v1/sensors", sensorRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/predictions", predictionRoutes);
app.use("/api/v1/incidents", incidentRoutes);

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
