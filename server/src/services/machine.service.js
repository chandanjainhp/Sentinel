import { Machine } from "../models/machine.model.js";
import { getSiteById } from "./site.service.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

export const buildMachineQuery = (machineId, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(machineId);
  if (isObjectId) {
    return {
      ...userFilter,
      $or: [{ machineId }, { _id: machineId }],
    };
  }
  return {
    ...userFilter,
    machineId,
  };
};

export const createMachine = async (siteIdParam, machineData, userId) => {
  const site = await getSiteById(siteIdParam, { userId });

  const machine = await Machine.create({
    userId,
    siteId: site._id,
    assetId: machineData.assetId,
    name: machineData.name,
    machineType: machineData.machineType,
    manufacturer: machineData.manufacturer || "",
    model: machineData.model || "",
    serialNumber: machineData.serialNumber || "",
    location: machineData.location || "",
    zone: machineData.zone || "",
    status: "unknown",
  });

  return machine;
};

export const getMachinesBySite = async (siteIdParam, userFilter = {}) => {
  const site = await getSiteById(siteIdParam, userFilter);
  return Machine.find({ ...userFilter, siteId: site._id }).sort({ createdAt: -1 });
};

export const getMachineById = async (machineIdParam, userFilter = {}) => {
  const query = buildMachineQuery(machineIdParam, userFilter);
  const machine = await Machine.findOne(query);
  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }
  return machine;
};

export const updateMachine = async (machineIdParam, updateData, userFilter = {}) => {
  const query = buildMachineQuery(machineIdParam, userFilter);
  const machine = await Machine.findOneAndUpdate(query, { $set: updateData }, { new: true, runValidators: true });
  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }
  return machine;
};

export const deleteMachine = async (machineIdParam, userFilter = {}) => {
  const query = buildMachineQuery(machineIdParam, userFilter);
  const machine = await Machine.findOneAndDelete(query);
  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }
  return machine;
};
