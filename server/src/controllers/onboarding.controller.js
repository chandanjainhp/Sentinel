import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import { createOnboarding } from "../services/onboarding.service.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const createOnboardingController = asyncHandler(async (req, res) => {
  const idempotencyKey = req.get("Idempotency-Key");
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "A valid Idempotency-Key header is required"));
  }

  const result = await createOnboarding({
    userId: req.user._id,
    payload: req.validated.body,
    idempotencyKey,
  });

  const duplicate = Boolean(result.duplicate);
  const status = duplicate ? 200 : 201;

  // The secret is only ever returned by the request that created the key.
  const data = duplicate
    ? { ...result, secret: undefined, secretAlreadyShown: Boolean(result.keyCreated) }
    : result;

  // The response can contain a one-time API key, so it must never be cached.
  res.set("Cache-Control", "no-store");

  return res.status(status).json(
    new ApiResponse(
      status,
      data,
      duplicate ? "Onboarding was already completed" : "Onboarding completed"
    )
  );
});
