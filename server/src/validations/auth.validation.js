import { z } from "zod";

/**
 * Auth request schemas.
 *
 * The age gate (assertEligibleForAccountCreation) stays in the controller:
 * it owns the 400/403 distinction and the "persist nothing" ordering, so
 * ageConfirmed/dateOfBirth are only shape-checked here.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

// Matches the client's 8-character minimum; bcrypt ignores bytes past 72.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");

const ageEvidence = {
  ageConfirmed: z.boolean().optional(),
  dateOfBirth: z.string().trim().optional(),
};

export const registerSchema = z.object({
  body: z.object({
    email,
    username: z.string().trim().toLowerCase().min(3, "Username must be at least 3 characters").max(30),
    password,
    ...ageEvidence,
  }),
  params: z.object({}),
  query: z.object({}),
});

// Login accepts any password length: the credential check, not the policy,
// decides the outcome for accounts created before a policy change.
export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, "Password is required"),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const googleAuthSchema = z.object({
  body: z
    .object({
      credential: z.string().min(1).optional(),
      idToken: z.string().min(1).optional(),
      ...ageEvidence,
    })
    .refine((body) => body.credential || body.idToken, {
      message: "Google credential is required",
      path: ["credential"],
    }),
  params: z.object({}),
  query: z.object({}),
});

export const verifyEmailSchema = z.object({
  body: z.object({ otp: z.string().trim().min(1, "OTP is required") }),
  params: z.object({}),
  query: z.object({}),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email }),
  params: z.object({}),
  query: z.object({}),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    otp: z.string().trim().min(1, "OTP is required"),
    newPassword: password,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: password,
  }),
  params: z.object({}),
  query: z.object({}),
});

// Refresh normally rides on the httpOnly cookie; the body is the fallback for
// non-browser clients, so it must stay optional.
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token must be a non-empty string").optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});
