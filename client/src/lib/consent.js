/**
 * Analytics & session-replay consent (opt-in, stored, revocable).
 *
 * Policy (docs/analytics-privacy.md):
 *  - NO analytics, session-replay, heatmap, rage-click, or keystroke-logging
 *    SDK may record anything until the user has explicitly opted in here.
 *  - Absence of a stored choice is NOT consent. There is no "implied
 *    consent" banner: recording stays OFF until `setRecordingConsent(true)`.
 *  - The choice is persisted locally and revocable at any time from
 *    Settings → Privacy (`SessionRecordingConsent`); revoking stops recording
 *    immediately (see `onRecordingConsentChange` subscriptions).
 *  - Even when consent is GRANTED, SDKs must be configured to:
 *      * mask all text input by default,
 *      * never capture password, payment, or email fields,
 *      * not start recording until consent has been granted.
 *    See MASKING_RULES below and docs/analytics-privacy.md.
 */

const STORAGE_KEY = 'sentinel.analytics.recording-consent';
const STORAGE_VERSION = 1;

const listeners = new Set();

function safeLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Storage can throw in private mode / blocked-cookie setups.
    return null;
  }
}

function readStored() {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STORAGE_VERSION) return null;
    if (typeof parsed.granted !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(granted) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, granted, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore write failures; consent simply won't persist.
  }
}

/**
 * Current consent state.
 * @returns {{ decided: boolean, granted: boolean }}
 *   `decided:false, granted:false` = never asked (default) → recording OFF.
 */
export function getRecordingConsent() {
  const stored = readStored();
  if (!stored) return { decided: false, granted: false };
  return { decided: true, granted: stored.granted };
}

/**
 * Boolean gate for SDK initialization. Recording/replay/heatmap/keystroke
 * SDKs must check this BEFORE loading or starting and must not record when
 * it returns false.
 * @returns {boolean}
 */
export function hasRecordingConsent() {
  return getRecordingConsent().granted;
}

/**
 * Store the user's explicit choice. Consent is opt-in only: pass `true` only
 * from a user action on the consent control (never automatically, never from
 * a banner default). Pass `false` to grant nothing or to revoke.
 * @param {boolean} granted
 */
export function setRecordingConsent(granted) {
  writeStored(Boolean(granted));
  const consent = getRecordingConsent();
  listeners.forEach((fn) => {
    try {
      fn(consent);
    } catch {
      // A broken subscriber must not break consent storage.
    }
  });
  return consent;
}

/** Convenience: revoke consent (identical to setRecordingConsent(false)). */
export function revokeRecordingConsent() {
  return setRecordingConsent(false);
}

/**
 * Subscribe to consent changes. Returns an unsubscribe function.
 * SDK wrappers should subscribe and start/stop recording accordingly so a
 * revocation takes effect immediately.
 * @param {(consent: {decided: boolean, granted: boolean}) => void} fn
 * @returns {() => void}
 */
export function onRecordingConsentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Hard privacy rules ANY replay/heatmap SDK config must follow, even with
 * consent granted. Spread these into the SDK options object.
 *
 * Field-level "never record" (password / payment / email) is enforced by
 * SDK config where the vendor supports named exclusions, plus the data-* /
 * class markers below on the inputs themselves (belt and braces).
 */
export const MASKING_RULES = {
  // Never capture these field types, regardless of SDK defaults.
  blockSelector:
    'input[type=password], input[type=email], input[type=tel], input[autocomplete*=cc-], input[autocomplete*=card], input[autocomplete*=email], [data-recording="private"], .recording-private',
  // Mask every other text entry point (inputs, textareas, selects, contenteditable).
  maskAllInputs: true,
  maskInputOptions: {
    password: true,
    email: true,
    tel: true,
    text: true,
    textarea: true,
    search: true,
    number: true,
    date: true,
    contenteditable: true,
  },
  maskTextClass: 'recording-mask',
  maskTextSelector: '[data-recording="mask"]',
  // Ignore all input events entirely for maximum privacy when supported.
  collectUserInput: false,
  ignoreClass: 'recording-ignore',
};

/**
 * Convenience gate for SDK wrappers: only true when the user has opted in.
 * Usage:
 *   if (!recordingAllowed()) return;      // never init the SDK
 *   initSdk({ ...MASKING_RULES, ...sdkOptions });
 */
export function recordingAllowed() {
  return hasRecordingConsent();
}
