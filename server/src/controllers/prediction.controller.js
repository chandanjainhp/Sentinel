import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as predictionService from "../services/prediction.service.js";

export const getMachinePredictions = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const predictions = await predictionService.getMachinePredictions(machineId, req.query, req.userFilter);
  return res.status(200).json(new ApiResponse(200, predictions, "Predictions fetched successfully"));
});

export const getLatestPrediction = asyncHandler(async (req, res) => {
  const { machineId } = req.params;
  const prediction = await predictionService.getLatestPrediction(machineId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, prediction, "Latest prediction fetched successfully"));
});

export const getPrediction = asyncHandler(async (req, res) => {
  const { predictionId } = req.params;
  const prediction = await predictionService.getPredictionById(predictionId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, prediction, "Prediction fetched successfully"));
});