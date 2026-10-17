import { ApiError } from "./api-error.js";

/**
 * Minimum age (in years) required to create an account.
 *
 * The gate is enforced SERVER-SIDE before any account is created, on every
 * account-creation path (email/password registration, Google sign-up). A
 * rejected attempt must persist nothing — no user record, no tokens, no
 * backfilled profile fields — so these checks throw before any write.
 */
export const MINIMUM_ACCOUNT_AGE_YEARS = 13;

/**
 * Parse a strict YYYY-MM-DD calendar date as UTC midnight.
 * Rejects malformed strings and impossible calendar dates (2026-02-31).
 * Returns null when invalid.
 */
const parseUtcDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * Completed-years age at `now`, computed in UTC so the result is
 * deterministic regardless of server timezone. Birth date is inclusive:
 * a user turns 13 on the UTC anniversary of their birth date.
 */
export const ageInYears = (dateOfBirth, now = new Date()) => {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
};

/**
 * Enforce the 13+ age requirement BEFORE an account is created (or before an
 * existing account is linked to a new Google identity).
 *
 * Accepted evidence, either of:
 *  - `dateOfBirth` (YYYY-MM-DD): must parse and yield an age >= 13, or
 *  - `ageConfirmed: true`: an explicit "I am 13 or older" attestation.
 *
 * Throws (so nothing is written downstream):
 *  - 403 when the supplied evidence proves the user is under 13, or the
 *    attestation itself claims an age below the minimum.
 *  - 400 when no valid evidence is supplied (missing attestation, malformed
 *    or impossible date of birth).
 */
export function assertEligibleForAccountCreation(body = {}) {
  const ageConfirmed = body?.ageConfirmed;
  const dateOfBirth = body?.dateOfBirth;

  const hasDob = typeof dateOfBirth === "string" && dateOfBirth.trim() !== "";

  if (hasDob) {
    const dob = parseUtcDateOnly(dateOfBirth);
    if (!dob) {
      throw new ApiError(
        400,
        "dateOfBirth must be a valid date in YYYY-MM-DD format",
      );
    }
    const age = ageInYears(dob);
    if (age < MINIMUM_ACCOUNT_AGE_YEARS) {
      throw new ApiError(
        403,
        `You must be at least ${MINIMUM_ACCOUNT_AGE_YEARS} years old to create an account`,
      );
    }
    // A valid date of birth is stronger evidence than the checkbox, so it
    // satisfies the gate on its own.
    return;
  }

  if (ageConfirmed === true) {
    return;
  }

  if (ageConfirmed === false) {
    throw new ApiError(
      403,
      `You must be at least ${MINIMUM_ACCOUNT_AGE_YEARS} years old to create an account`,
    );
  }

  throw new ApiError(
    400,
    "You must confirm you are 13 or older to create an account",
  );
}
