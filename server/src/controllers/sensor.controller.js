import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as sensorService from "../services/sensor.service.js";

export const createSensor = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const userId = req.user._id;

  const sensor = await sensorService.createSensor(machineId, req.body, userId);
  return res.status(201).json(new ApiResponse(201, sensor, "Sensor created successfully"));
});

export const getSensors = asyncHandler(async (req, res) => {
  const sensors = await sensorService.listSensors(req.userFilter);
  return res.status(200).json(new ApiResponse(200, sensors, "Sensors fetched successfully"));
});

export const getSensorsForMachine = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const sensors = await sensorService.getSensorsByMachine(machineId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, sensors, "Sensors fetched successfully"));
});

export const getSensorSummary = asyncHandler(async (req, res) => {
  const summary = await sensorService.getSensorSummary(req.userFilter);
  return res.status(200).json(new ApiResponse(200, summary, "Sensor summary fetched successfully"));
});

export const getSensor = asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  const sensor = await sensorService.getSensorById(sensorId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, sensor, "Sensor fetched successfully"));
});

export const updateSensor = asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  const sensor = await sensorService.updateSensor(sensorId, req.body, req.userFilter);
  return res.status(200).json(new ApiResponse(200, sensor, "Sensor updated successfully"));
});

export const deleteSensor = asyncHandler(async (req, res) => {
  const { sensorId } = req.params;
  await sensorService.deleteSensor(sensorId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, null, "Sensor deleted successfully"));
});
