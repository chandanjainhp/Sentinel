import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { filterSensitiveData } from "../utils/sensitive-data-filter.js";

/**
 * Filter error for client response.
 * Removes sensitive data from error messages and stack traces.
 */
const filterErrorForResponse = (error) => {
  const message = error instanceof ApiError
    ? error.message
    : "Internal server error";

  // Filter sensitive data from the message
  const filteredMessage = filterSensitiveData(message);

  // For non-ApiError, also filter any potential sensitive data
  // Don't expose internal details in production
  if (!(error instanceof ApiError) && process.env.NODE_ENV === 'production') {
    return {
      message: filteredMessage,
      errors: [],
    };
  }

  return {
    message: filteredMessage,
    errors: error.errors || [],
  };
};

export const errorHandler = (error, _req, res, _next) => {
  let statusCode = error.statusCode || 500;
  let { message, errors } = filterErrorForResponse(error);

  if (!(error instanceof ApiError)) {
    if (error.type === "entity.too.large") {
      statusCode = 413;
      message = "Request body too large";
    } else if (error instanceof SyntaxError && "body" in error) {
      statusCode = 400;
      message = "Invalid JSON";
    }
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

  return res.status(statusCode).json(response);
};

export const notFoundHandler = (_req, _res, next) => {
  next(new ApiError(404, "Resource not found"));
};

export const errorMiddleware = errorHandler;
