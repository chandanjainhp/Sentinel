# Sentinel — Industrial Predictive Maintenance

Sentinel is a customer-facing industrial predictive-maintenance platform.

It connects industrial machines and sensors, receives real machine data, runs predictive-maintenance models, evaluates machine health, and creates actionable incidents when equipment risk increases.

**Product:** Sentinel  
**AI analyst:** Argus (planned for a later phase)  
**Design language:** Night Watch  
**Current release:** V1

---

## V1 Goal

V1 focuses on one customer outcome:

> Connect a machine, receive its sensor data, detect abnormal behavior, and show the customer which machine needs attention and why.

The V1 flow is:

```text
Customer
   ↓
Organization
   ↓
Site / Factory
   ↓
Machine
   ↓
Sensor
   ↓
API Key
   ↓
POST /api/v1/events
   ↓
Store Sensor Event
   ↓
Prediction Worker
   ↓
Python ML Service
   ↓
RUL + Anomaly + Fault Probability
   ↓
Machine Health
   ↓
Incident
```

V1 does not include Argus investigation, RAG, morning briefings, MCP, advanced integrations, customer billing, or seed data.

---

## What Sentinel Does

A customer creates an industrial site and registers its machines and sensors.

Sensor gateways send readings to Sentinel using a named API key.

Sentinel stores the event, places prediction work on a background queue, and sends the relevant sensor data to the predictive-maintenance ML service.

The ML service uses the industrial predictive-maintenance models to produce structured predictions such as:

- Remaining Useful Life (RUL)
- Anomaly score
- Fault probability
- Fault type
- Model confidence
- Model name and version

Sentinel converts those predictions into a machine-health state:

```text
HEALTHY
WARNING
CRITICAL
OFFLINE
MAINTENANCE
UNKNOWN
```

When configured thresholds are crossed, Sentinel creates an incident for the machine.

---

## Customer Flow

The normal customer workflow is intentionally small.

```text
Login
  ↓
Overview
  ↓
Sites
  ↓
Site
  ↓
Machines
  ↓
Machine Health
  ↓
Incident
  ↓
Action
```

### Main client routes

```text
/overview
/sites
/sites/[siteId]
/machines/[machineId]
/incidents
/incidents/[incidentId]
/settings/api-keys
```

### Main product pages

**Overview**

Shows total machines, healthy machines, warning machines, critical machines, active incidents, and predicted-risk machines.

**Sites**

Shows the customer's industrial facilities.

**Site**

Shows machines and site-level health.

**Machine**

Shows:

```text
Machine Health
RUL
Anomaly Score
Fault Probability
Sensor Trends
Prediction History
Active Incidents
```

**Incident**

Shows:

```text
Machine
Severity
Risk
Prediction
Evidence
Reason
Recommended next action
```

---

## Architecture

Sentinel separates product logic from machine-learning inference.

```text
                    Industrial Site
                         │
                  PLC / SCADA / Gateway
                         │
                         ▼
                 POST /api/v1/events
                         │
                         ▼
                 Sentinel API Server
                         │
                  MongoDB Event Store
                         │
                         ▼
                       BullMQ
                         │
                         ▼
                Prediction Worker
                         │
                         ▼
                  Python ML Service
                         │
                         ▼
          Industrial Predictive ML Engine
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
            RUL      Anomaly Score  Fault Risk
             └───────────┼───────────┘
                         ▼
                  Prediction Store
                         │
                         ▼
                   Machine Health
                         │
                         ▼
                      Incident
                         │
                         ▼
                 Customer Dashboard
```

### Responsibilities

**Sentinel API**

Customer accounts, organizations, sites, machines, sensors, event ingestion, authorization, health state, incidents, and product APIs.

**BullMQ**

Background prediction and processing jobs.

**Python ML Service**

Loads predictive-maintenance models and executes inference.

**MongoDB**

Stores customer, site, machine, sensor, event, prediction, and incident data.

**Redis**

Queue and background-job infrastructure.

**Qdrant**

Reserved for later RAG functionality. It is not required for the V1 machine-health flow.

---

## Machine-Learning Foundation

Sentinel uses the IEEE IES Industrial Predictive Maintenance project as its ML foundation:

<https://github.com/IEEE-IES-Industrial-AI-Lab/Industrial-Predictive-Maintenance>

The repository provides:

- NASA CMAPSS
- IMS Bearing
- Paderborn Bearing
- CWRU Bearing
- LSTM predictive model
- Transformer RUL model
- TCN model
- LSTM Autoencoder anomaly detection
- RUL evaluation
- Fault evaluation
- Edge inference
- Streaming inference

Sentinel should integrate these capabilities through a dedicated Python ML service rather than placing PyTorch/model execution inside the main Express/Bun process.

The upstream project already provides a streaming inference pipeline intended for continuous industrial sensor streams.

---

## V1 Domain Model

```text
Organization
    │
    └── Site
         │
         └── Machine
              │
              └── Sensor
                   │
                   └── Event
                        │
                        ▼
                    Prediction
                        │
                        ▼
                  Machine Health
                        │
                        ▼
                    Incident
```

### Site

Represents a real industrial factory or facility.

### Machine

Represents equipment such as:

```text
Motor
Pump
Compressor
Fan
Conveyor
Gearbox
```

### Sensor

Represents a measurable signal such as:

```text
Temperature
Vibration
Pressure
Current
Voltage
RPM
Flow
```

### Event

Represents raw sensor data received from a gateway or integration.

### Prediction

Represents ML output for a machine at a point in time.

### Incident

Represents an actionable machine-health problem after thresholds are crossed.

---

## V1 API

All APIs are prefixed with `/api/v1`.

### Authentication

Existing Sentinel authentication remains available:

```text
POST /api/v1/auth/register
POST /api/v1/auth/verify-email
POST /api/v1/auth/login
POST /api/v1/auth/refresh-token
POST /api/v1/auth/logout
GET  /api/v1/auth/current-user
```

### Organization

```text
GET   /api/v1/org/me
PATCH /api/v1/org/me/config
```

### Sites

```text
GET    /api/v1/sites
POST   /api/v1/sites
GET    /api/v1/sites/:siteId
PATCH  /api/v1/sites/:siteId
DELETE /api/v1/sites/:siteId
```

### Machines

```text
GET    /api/v1/machines/:machineId
PATCH  /api/v1/machines/:machineId
DELETE /api/v1/machines/:machineId

GET    /api/v1/machines/sites/:siteId/machines
POST   /api/v1/machines/sites/:siteId/machines
```

### Sensors

```text
GET    /api/v1/sensors/machines/:machineId/sensors
POST   /api/v1/sensors/machines/:machineId/sensors
GET    /api/v1/sensors/:sensorId
PATCH  /api/v1/sensors/:sensorId
DELETE /api/v1/sensors/:sensorId
```

### API Keys

```text
GET    /api/v1/org/api-keys
POST   /api/v1/org/api-keys
DELETE /api/v1/org/api-keys/:keyId
```

Raw API keys are shown only once. Only the SHA-256 hash is persisted.

### Sensor Event Ingestion

```text
POST /api/v1/events
```

Sensor or gateway authentication:

```http
Authorization: Bearer <api-key>
Idempotency-Key: <unique-event-id>
```

Example payload:

```json
{
  "siteId": "site_001",
  "machineId": "machine_042",
  "sensorId": "vibration_042",
  "timestamp": "2026-08-14T06:30:00Z",
  "type": "sensor_reading",
  "values": {
    "temperature": 82.4,
    "vibration": 7.31,
    "current": 14.8,
    "rpm": 1480
  },
  "source": "gateway"
}
```

### Events

```text
GET /api/v1/events
GET /api/v1/events/:eventId
```

### Predictions

```text
GET /api/v1/predictions/machines/:machineId
GET /api/v1/predictions/machines/:machineId/latest
GET /api/v1/predictions/:predictionId
```

### Incidents

```text
GET   /api/v1/incidents
GET   /api/v1/incidents/:incidentId
PATCH /api/v1/incidents/:incidentId/status
```

---

## Event Processing

A normal sensor event follows this sequence:

```text
1. Gateway sends event
2. API key is verified
3. Zod validates request
4. Machine and sensor are verified
5. Idempotency is checked
6. Event is stored
7. Prediction job is queued
8. Prediction worker loads the event/window
9. Python ML service performs inference
10. Prediction is stored
11. Machine health is recalculated
12. Threshold rules are evaluated
13. Incident is created when required
```

The HTTP API must not block on model inference.

---

## Idempotency

Sensor gateways can retry requests. Sentinel must not create duplicate events.

The event ingestion endpoint accepts:

```text
Idempotency-Key
```

If it is missing, the backend can derive a deterministic SHA-256 event fingerprint from the event content.

The event collection has a unique organization-scoped idempotency index.

---

## Prediction Contract

The Python ML service returns structured data.

Example:

```json
{
  "machineId": "machine_042",
  "model": "transformer_rul",
  "modelVersion": "1.0.0",
  "rulValue": 47,
  "rulUnit": "cycles",
  "anomalyScore": 0.91,
  "faultProbability": 0.86,
  "faultType": "bearing_degradation",
  "confidence": 0.87
}
```

The model output is data, not customer-facing narrative.

Customer explanations belong to a later Argus layer.

---

## Machine Health

V1 uses deterministic health rules.

Example defaults:

```text
CRITICAL
anomalyScore >= 0.90
or faultProbability >= 0.85

WARNING
anomalyScore >= 0.75
or faultProbability >= 0.65

HEALTHY
below warning thresholds
```

These thresholds should become configurable after V1.

The LLM must not determine the raw machine-health score.

---

## Incident Rules

An incident is created when a machine crosses a configured risk threshold.

Examples:

```text
High anomaly score
High fault probability
Low RUL
Repeated abnormal predictions
```

V1 uses a simple incident lifecycle:

```text
open
  ↓
reviewed
  ↓
closed
```

Repeated sensor samples should be correlated into a single useful incident instead of creating hundreds of alerts.

---

## Security

V1 follows the existing Sentinel security architecture.

### Customer authentication

- JWT access token
- httpOnly cookies
- refresh token
- token-version invalidation
- bcrypt passwords

### Machine authentication

- named API keys
- Bearer authentication
- SHA-256 API-key hashes
- key revocation
- key rotation
- API-key scopes

### Data isolation

Every customer-owned record contains `orgId`.

Queries must use the authenticated organization scope.

Never trust a client-supplied `orgId`.

### Webhook / external security

Webhook signing and other external integrations are later-stage features and are not part of the V1 machine-health flow.

---

## Validation

V1 uses Zod for request validation.

```text
server/src/validations/industrial/
├── site.schema.js
├── machine.schema.js
├── sensor.schema.js
├── event.schema.js
├── prediction.schema.js
└── incident.schema.js
```

Request flow:

```text
Authentication
   ↓
Zod validation
   ↓
Controller
   ↓
Service
   ↓
Database / Queue / ML
```

---

## Backend Structure

Recommended V1 structure:

```text
server/src/
├── controllers/
│   ├── site.controller.js
│   ├── machine.controller.js
│   ├── sensor.controller.js
│   ├── event.controller.js
│   ├── prediction.controller.js
│   └── incident.controller.js
│
├── models/
│   ├── site.model.js
│   ├── machine.model.js
│   ├── sensor.model.js
│   ├── event.model.js
│   ├── prediction.model.js
│   └── incident.model.js
│
├── validations/
│       ├── site.schema.js
│       ├── machine.schema.js
│       ├── sensor.schema.js
│       ├── event.schema.js
│       ├── prediction.schema.js
│       └── incident.schema.js
│
├── middlewares/
│   ├── auth.middleware.js
│   ├── apiKey.middleware.js
│   ├── validate.middleware.js
│   └── error.middleware.js
│
├── routes/
│   ├── site.routes.js
│   ├── machine.routes.js
│   ├── sensor.routes.js
│   ├── event.routes.js
│   ├── prediction.routes.js
│   └── incident.routes.js
│
├── services/
│   └── prediction.service.js
│
└── queues/
    ├── prediction.queue.js
    └── prediction.worker.js
```

The main API should not execute PyTorch directly.

---

## Python ML Service

Recommended structure:

```text
ml-service/
├── app/
│   ├── main.py
│   ├── routes/
│   │   └── predict.py
│   ├── services/
│   │   └── predictor.py
│   └── schemas/
│       └── prediction.py
├── models/
├── requirements.txt
└── Dockerfile
```

The service exposes a prediction endpoint such as:

```text
POST /predict
```

The Node/Bun prediction worker communicates with this service over the Docker network.

---

## Environment

Core application variables:

```bash
NODE_ENV=development
PORT=8000
CLIENT_URL=http://localhost:3000

MONGODB_URL=mongodb://localhost:27017/sentinel
REDIS_URL=redis://localhost:6379

ACCESS_TOKEN_SECRET=<random-secret>
REFRESH_TOKEN_SECRET=<random-secret>

ML_SERVICE_URL=http://ml-service:9000
```

The exact environment variables should follow the existing Sentinel `.env` conventions.

Never commit real secrets.

---

## Local Development

Start the core infrastructure using Docker Compose.

```bash
docker compose up
```

Run the server independently when needed:

```bash
cd server
bun run dev
```

Run the client independently when needed:

```bash
cd client
npm run dev
```

Run the ML service independently when needed:

```bash
cd ml-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 9000
```

---

## V1 Docker Services

The target V1 stack is:

```text
client
server
worker
mongodb
redis
ml-service
```

Qdrant can remain available because it is part of the broader Sentinel architecture, but V1 machine-health processing does not depend on it.

---

## Testing

V1 tests should cover:

### Authentication

- valid JWT
- invalid JWT
- expired JWT
- inactive user
- invalid API key
- revoked API key

### Sites

- create site
- list sites
- get site
- update site
- delete site
- organization isolation

### Machines

- create machine
- list site machines
- get machine
- update machine
- delete machine
- organization isolation

### Sensors

- create sensor
- list sensors
- update sensor
- delete sensor
- invalid sensor type

### Events

- valid event
- invalid event
- unknown machine
- unknown sensor
- duplicate event
- idempotency
- organization isolation

### Predictions

- prediction storage
- latest prediction
- prediction history
- invalid prediction ID

### Incidents

- incident creation
- incident query
- severity
- status update
- duplicate prevention

### ML integration

- ML service available
- ML service timeout
- malformed ML response
- unsupported model
- prediction persistence

---

## V1 Acceptance Criteria

V1 is complete when a real customer can:

1. Register and log in.
2. Create an industrial site.
3. Add a machine.
4. Add sensors to the machine.
5. Generate an API key.
6. Send real sensor events.
7. See those events stored by Sentinel.
8. Run predictive inference asynchronously.
9. Store RUL/anomaly/fault predictions.
10. See the machine health state.
11. Receive an incident when a threshold is crossed.
12. Open the incident and understand the underlying machine risk.

No fake seed data is required.

No manual source-code modification should be necessary to connect a new customer machine after the platform is deployed.

---

## V1 Scope Boundary

### Included

- Organization
- Site
- Machine
- Sensor
- API keys
- Sensor ingestion
- Event storage
- Prediction worker
- Python ML service
- RUL
- Anomaly detection
- Fault probability
- Machine health
- Basic incidents
- Customer dashboard API
- Security and organization isolation

### Later

- Argus AI investigation
- RAG
- Morning briefing
- Maintenance work orders
- Email notifications
- Slack integration
- Webhooks
- MCP
- OPC-UA connector
- MQTT connector
- Edge agent
- Advanced model registry
- Model training UI
- Model drift monitoring
- Billing
- Enterprise SSO

---

## Design Principles

### 1. Customer outcome first

Every V1 feature must improve the customer's ability to identify an unhealthy machine and take action.

### 2. Prediction is asynchronous

The API must not block on ML inference.

### 3. ML and product logic are separate

Sentinel manages customers, machines, events, predictions, health, and incidents.

The Python service manages numerical ML inference.

### 4. Deterministic health

Machine-health states come from explicit rules, not an LLM.

### 5. Evidence before explanation

The system stores the actual sensor event and prediction that produced an incident.

### 6. Organization isolation

Customer data must never cross organization boundaries.

### 7. No unnecessary features

V1 is intentionally small. Build the machine-health loop completely before adding the later Sentinel capabilities.

---

## Roadmap

```text
V1
Sensor → Prediction → Health → Incident

V2
Argus → Diagnosis → Recommendation

V3
Maintenance → Notifications → Integrations

V4
Edge → OPC-UA → MQTT → Enterprise deployment
```

---

## License

See the repository license file.
# Sentinel
