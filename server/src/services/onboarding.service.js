import crypto from "node:crypto";
import mongoose from "mongoose";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import ApiKey, { generateSiteApiKeySecret, hashApiKeySecret, apiKeyPrefixFromSecret } from "../models/apiKey.model.js";
import { OnboardingRequest } from "../models/onboarding-request.model.js";
import { ApiError } from "../utils/api-error.js";
import { normalizeName, normalizeCity, SENSOR_UNITS } from "../utils/onboarding.js";

const publicResult = ({ site, machine, sensors, secret, key }) => ({
  siteId: site.siteId,
  machineId: machine.machineId,
  sensors: sensors.map((sensor) => ({
    sensorId: sensor.sensorId,
    name: sensor.name,
    type: sensor.type,
    unit: sensor.unit,
  })),
  machineName: machine.name,
  keyPrefix: key?.keyPrefix || key?.prefix,
  secret,
});

export async function createOnboarding({ userId, payload, idempotencyKey }) {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, "Idempotency-Key is required");
  const existingRequest = await OnboardingRequest.findOne({ userId, idempotencyKey }).lean();
  if (existingRequest) return { ...existingRequest.result, duplicate: true };

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let site;
      let key;
      let secret;
      if (payload.existingSiteId) {
        site = await Site.findOne({ siteId: payload.existingSiteId, userId }).session(session);
        if (!site) throw new ApiError(404, "Existing site not found");
        key = await ApiKey.findOne({ siteId: site._id, userId, revokedAt: null }).sort({ createdAt: -1 }).session(session);
      } else {
        const siteData = payload.site;
        const normalizedName = normalizeName(siteData.name);
        const cityNormalized = normalizeCity(siteData.city);
        site = await Site.create([{
          userId,
          accountId: userId,
          name: siteData.name,
          nameNormalized: normalizedName,
          country: siteData.country,
          postalCode: siteData.postalCode || null,
          city: siteData.city,
          cityNormalized,
          cityVerified: siteData.cityVerified,
          timezone: siteData.timezone,
          status: "active",
        }], { session }).then(([created]) => created);
        secret = generateSiteApiKeySecret();
        const prefix = apiKeyPrefixFromSecret(secret);
        key = await ApiKey.create([{
          userId,
          siteId: site._id,
          label: "Site key",
          name: "Site key",
          keyPrefix: prefix,
          prefix,
          hashedSecret: hashApiKeySecret(secret),
        }], { session }).then(([created]) => created);
      }

      const normalizedMachineName = normalizeName(payload.machine.name);
      const siteMachines = await Machine.find({ siteId: site._id }).session(session);
      let machine = siteMachines.find((candidate) => normalizeName(candidate.name) === normalizedMachineName);
      if (!machine) {
        machine = await Machine.create([{
          userId,
          siteId: site._id,
          assetId: `asset_${crypto.randomUUID()}`,
          name: payload.machine.name,
          nameNormalized: normalizedMachineName,
          machineType: "unknown",
          status: "unknown",
        }], { session }).then(([created]) => created);
      }

      const sensors = [];
      for (const input of payload.sensors) {
        const sensorName = normalizeName(input.name);
        const machineSensors = await Sensor.find({ machineId: machine._id }).session(session);
        const duplicate = machineSensors.find((candidate) => normalizeName(candidate.name) === sensorName);
        if (duplicate) throw new ApiError(409, `Sensor "${input.name}" already exists`);
        sensors.push(await Sensor.create([{
          userId,
          siteId: site._id,
          machineId: machine._id,
          name: input.name,
          nameNormalized: sensorName,
          type: input.type,
          unit: SENSOR_UNITS[input.type],
          status: "active",
        }], { session }).then(([created]) => created));
      }
      result = publicResult({ site, machine, sensors, secret, key });
      await OnboardingRequest.create([{ userId, idempotencyKey, result }], { session });
    });
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, "A site, machine, sensor, or request with that name already exists");
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}
