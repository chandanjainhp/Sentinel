import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as machineService from "../services/machine.service.js";
import { getMachineCoverage } from "../services/coverage.service.js";

export const createMachine = asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const userId = req.user._id;

  const machine = await machineService.createMachine(siteId, req.body, userId);
  return res.status(201).json(new ApiResponse(201, machine, "Machine created successfully"));
});

export const getMachines = asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const machines = await machineService.getMachinesBySite(siteId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, machines, "Machines fetched successfully"));
});

export const getMachine = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const machine = await machineService.getMachineById(machineId, req.userFilter);

  // Coverage rides along with the machine detail so the frontend gets both
  // in a single call.
  const coverage = await getMachineCoverage(machineId, { userFilter: req.userFilter });
  return res.status(200).json(
    new ApiResponse(200, { ...machine.toObject(), coverage }, "Machine fetched successfully")
  );
});

export const getMachineCoverageStatus = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const coverage = await getMachineCoverage(machineId, { userFilter: req.userFilter });
  return res.status(200).json(new ApiResponse(200, coverage, "Machine coverage fetched successfully"));
});

export const getAllMachineCoverages = asyncHandler(async (req, res) => {
  const coverages = await machineService.getAllMachineCoverages(req.userFilter);
  return res.status(200).json(new ApiResponse(200, coverages, "Machine coverages fetched successfully"));
});

export const updateMachine = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const machine = await machineService.updateMachine(machineId, req.body, req.userFilter);
  return res.status(200).json(new ApiResponse(200, machine, "Machine updated successfully"));
});

export const deleteMachine = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  await machineService.deleteMachine(machineId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, null, "Machine deleted successfully"));
});
