/**
 * JWT secrets.
 *
 * Production must supply its own secrets. Missing secrets fail loudly
 * (and `assertSecretsConfigured` stops startup) instead of silently
 * signing with a public string. There are NO fallback secrets —
 * in any environment, if the required env vars are not set, the
 * application will refuse to start.
 */

const readSecret = (name) => {
  const value = process.env[name];
  if (value) return value;

  // In ANY environment (including development and test), if the secret
  // is not set, we fail fast. This prevents accidental use of public
  // fallback values that could compromise security.
  const error = new Error(
    `[config] ${name} is not set — refusing to sign tokens without explicit configuration`,
  );
  error.code = "INSECURE_CONFIG";
  throw error;
};

export const accessTokenSecret = () => readSecret("ACCESS_TOKEN_SECRET");
export const refreshTokenSecret = () => readSecret("REFRESH_TOKEN_SECRET");

/** Fail fast at startup when required secrets are missing. */
export const assertSecretsConfigured = () => {
  accessTokenSecret();
  refreshTokenSecret();
};
