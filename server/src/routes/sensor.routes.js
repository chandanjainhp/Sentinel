import { Router } from "express";
import {
  createSensor,
  getSensors,
  getSensorSummary,
  getSensorsForMachine,
  getSensor,
  updateSensor,
  deleteSensor,
} from "../controllers/sensor.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createSensorSchema,
  machineSensorParamsSchema,
  sensorIdSchema,
  updateSensorSchema,
} from "../industrial/sensor.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

// NOTE: static paths must be registered BEFORE /:sensorId so they are not
// captured by the parameterized route.
router.get("/summary", getSensorSummary);

router.get("/", getSensors);

router.post("/machines/:machineId/sensors", validate(createSensorSchema), createSensor);

router.get("/machines/:machineId/sensors", validate(machineSensorParamsSchema), getSensorsForMachine);

router.get("/:sensorId", validate(sensorIdSchema), getSensor);

router.patch("/:sensorId", validate(updateSensorSchema), updateSensor);

router.delete("/:sensorId", validate(sensorIdSchema), deleteSensor);

export default router;
