/**
 * JWT secrets.
 *
 * Production must supply its own secrets: a value baked into source would let
 * anyone who can read the repository mint access and refresh tokens. Missing
 * secrets fail loudly (and `assertSecretsConfigured` stops startup) instead of
 * silently signing with a public string.
 *
 * Development and test keep the previous fallbacks so local runs and the test
 * suite work without a .env — that is a convenience for non-production only.
 */

const DEV_FALLBACKS = {
  ACCESS_TOKEN_SECRET: "default-secret-key",
  REFRESH_TOKEN_SECRET: "default-refresh-secret",
};

const readSecret = (name) => {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === "production") {
    const error = new Error(
      `[config] ${name} is not set — refusing to sign tokens with a public fallback in production`,
    );
    error.code = "INSECURE_CONFIG";
    throw error;
  }

  return DEV_FALLBACKS[name];
};

export const accessTokenSecret = () => readSecret("ACCESS_TOKEN_SECRET");
export const refreshTokenSecret = () => readSecret("REFRESH_TOKEN_SECRET");

/** Fail fast at startup when production secrets are missing. */
export const assertSecretsConfigured = () => {
  accessTokenSecret();
  refreshTokenSecret();
};
