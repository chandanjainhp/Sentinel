#!/usr/bin/env bun
/**
 * secret-source-check — reports WHERE each environment variable came from
 * without ever printing a value.
 *
 * Usage:
 *   infisical run --env=dev -- bun src/scripts/secret-source-check.mjs
 *   bun src/scripts/secret-source-check.mjs [path-to-env-file] [--strict]
 *
 * The default env file path is ./.env (the file the process inherits via
 * dotenv). For every tracked key the report shows presence, value length, and
 * whether the in-process value is byte-identical to the copy on disk:
 *
 *   injected          set in process.env and absent from / different to the
 *                     on-disk .env -> the value was supplied by the wrapper
 *                     (i.e. Infisical), not read from disk
 *   matches-disk      identical to the on-disk .env value, so the source
 *                     cannot be proven either way
 *   missing           not set at all
 *
 * Only lengths and booleans are printed — never a value, prefix or hash of a
 * value beyond an equality comparison. --strict exits 1 if a tracked key is
 * missing, which makes it usable as a CI gate.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRACKED_KEYS = [
  'NODE_ENV',
  'PORT',
  'APP_URL',
  'CLIENT_URL',
  'CORS_ORIGIN',
  'LOG_LEVEL',
  'MONGODB_URL',
  'REDIS_URL',
  'MONGO_ROOT_USER',
  'MONGO_ROOT_PASSWORD',
  'MONGO_DB',
  'REDIS_PASSWORD',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'SENTRY_DSN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'MISTRAL_API_KEY',
  'CLOUDFLARE_TUNNEL_TOKEN',
  'ML_SERVICE_URL',
  'LLM_PROVIDER',
  'MOCK_AI',
];

/** Minimal KEY=VALUE parser — enough for the flat .env files this repo uses. */
const parseEnvFile = (raw) => {
  const entries = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key) continue;
    let value = trimmed.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    entries.set(key, value);
  }
  return entries;
};

/** Equality-only digest: never printed, used solely for a boolean compare. */
const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const envFileArg = args.find((arg) => !arg.startsWith('--')) ?? './.env';
const envPath = resolve(envFileArg);

const onDisk = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : null;

const keys = [...new Set([...TRACKED_KEYS, ...(onDisk ? onDisk.keys() : [])])].sort();

const rows = keys.map((key) => {
  const value = process.env[key];

  if (value === undefined) {
    return { key, status: 'missing', length: '-', origin: '-' };
  }
  if (!onDisk) {
    return { key, status: 'set', length: String(value.length), origin: 'injected' };
  }
  if (!onDisk.has(key)) {
    return {
      key,
      status: 'set',
      length: String(value.length),
      origin: 'injected (absent from env file)',
    };
  }
  const identical = digest(onDisk.get(key)) === digest(value);
  return {
    key,
    status: 'set',
    length: String(value.length),
    origin: identical ? 'matches-disk' : 'injected (differs from env file)',
  };
});

const keyWidth = Math.max(...rows.map((row) => row.key.length), 'VARIABLE'.length);
const statusWidth = 7;
const lengthWidth = Math.max(...rows.map((row) => row.length.length), 'LENGTH'.length);

console.log('secret-source-check — values are never printed');
console.log(`  env file      : ${envPath}${onDisk ? '' : ' (not present)'}`);
console.log(`  variables     : ${rows.length} tracked`);
console.log('');

console.log(
  `  ${'VARIABLE'.padEnd(keyWidth)}  ${'STATUS'.padEnd(statusWidth)}  ${'LENGTH'.padStart(lengthWidth)}  ORIGIN`
);
for (const row of rows) {
  console.log(
    `  ${row.key.padEnd(keyWidth)}  ${row.status.padEnd(statusWidth)}  ${row.length.padStart(lengthWidth)}  ${row.origin}`
  );
}

const missing = rows.filter((row) => row.status === 'missing');
const injected = rows.filter((row) => row.origin.startsWith('injected'));
const matchesDisk = rows.filter((row) => row.origin === 'matches-disk');

console.log('');
console.log(
  `  summary: ${injected.length} injected, ${matchesDisk.length} matching disk, ${missing.length} missing`
);
if (missing.length > 0 && !onDisk) {
  console.log('  note: no env file on disk, so every set variable came from the process environment.');
}

if (strict && missing.length > 0) {
  console.error(`  strict: ${missing.length} tracked variable(s) are missing`);
  process.exit(1);
}
