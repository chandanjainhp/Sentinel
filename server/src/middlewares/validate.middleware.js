import { ApiError } from "../utils/api-error.js";

export const validate = (schema) => {
  return (req, _res, next) => {
    if (!schema) return next();
    
    const result = schema.safeParse({
      // Express leaves req.body undefined on bodyless requests (GET/DELETE)
      body: req.body || {},
      params: req.params,
      query: req.query || {},
    });

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      throw new ApiError(400, "Validation failed", errors);
    }

    req.validated = result.data;
    next();
  };
};