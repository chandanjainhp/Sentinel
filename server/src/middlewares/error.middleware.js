import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";

export const errorHandler = (error, _req, res, _next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal server error";
  let errors = error.errors || [];

  if (!(error instanceof ApiError)) {
    if (error.name === "CastError") {
      statusCode = 400;
      message = `Invalid format for ${error.path}`;
    } else if (error.code === 11000) {
      statusCode = 409;
      message = "Duplicate record conflict";
    }
  }

  const response = new ApiResponse(statusCode, null, message);
  response.errors = errors;

  if (process.env.NODE_ENV !== "production" && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
};

export const notFoundHandler = (_req, _res, next) => {
  next(new ApiError(404, "Resource not found"));
};

export const errorMiddleware = errorHandler;