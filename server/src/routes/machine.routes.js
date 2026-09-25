import { Router } from "express";
import {
  createMachine,
  getMachines,
  getMachine,
  getMachineCoverageStatus,
  getAllMachineCoverages,
  updateMachine,
  deleteMachine,
} from "../controllers/machine.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createMachineSchema,
  siteMachineParamsSchema,
  machineIdSchema,
  updateMachineSchema,
} from "../industrial/machine.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

// Support both /api/v1/machines/sites/:siteId/machines and /api/v1/sites/:siteId/machines
router.post("/sites/:siteId/machines", validate(createMachineSchema), createMachine);

router.get("/sites/:siteId/machines", validate(siteMachineParamsSchema), getMachines);

// Static paths must be registered BEFORE /:machineId so they are not
// captured by the parameterized route.
router.get("/coverage", getAllMachineCoverages);

router.get("/:machineId/coverage", validate(machineIdSchema), getMachineCoverageStatus);

router.get("/:machineId", validate(machineIdSchema), getMachine);

router.patch("/:machineId", validate(updateMachineSchema), updateMachine);

router.delete("/:machineId", validate(machineIdSchema), deleteMachine);

export default router;
