# Analytics & Session-Recording Privacy Policy

Status: **enforced by code** ([client/src/lib/consent.js](../client/src/lib/consent.js)) · Owner: engineering
Last reviewed: 2026-10-06

## Scope

This policy covers every technology that observes or records user behavior:
product analytics, session replay, heatmaps, rage-click detection, click maps,
keystroke logging, funnel/analytics events, and error-replay attachments.

## Current state (audit 2026-10-06)

**Zero third-party analytics or recording SDKs are present.** Verified by
searching all packages, lockfiles, inline scripts, and markup for PostHog,
Hotjar, FullStory, LogRocket, Microsoft Clarity, Mixpanel, Amplitude, Segment,
Mouseflow, Smartlook, Inspectlet, Crazy Egg, Lucky Orange, SessionStack,
Glassbox, Quantum Metric, Datadog RUM, rrweb, Google Analytics/GTM, Meta Pixel,
Matomo, Plausible, and Umami. The standalone `log.html` / `client/log.html`
design pages contain no beacons, XHRs, or injected scripts.

The only telemetry in the product is **server-side Sentry**:
`server/src/index.js` → `Sentry.init({ dsn, environment, tracesSampleRate: 0.1 })`.
No `@sentry/replay` / `replayIntegration` is installed or enabled, so there is
no session recording of any kind today. No custom keydown/keystroke, click-map,
or heatmap listeners exist in the client.

## Rules for any future analytics or recording SDK

1. **Recording is opt-in, never opt-out.** Before any SDK loads or starts, it
   MUST check `hasRecordingConsent()` / `recordingAllowed()` from
   `client/src/lib/consent.js`. Absence of a stored choice means OFF. There is
   no consent banner that assumes consent and no "legitimate interest"
   recording.
2. **Consent is stored and revocable.** The choice lives in
   `localStorage` under `sentinel.analytics.recording-consent`
   (versioned JSON with an ISO timestamp) and is controlled from
   **Settings → General → Privacy** in the app. Revoking stops recording
   immediately — wrappers must subscribe via `onRecordingConsentChange` and
   stop the SDK synchronously on `granted: false`.
3. **Consent gate runs before network calls.** The SDK script must not even be
   fetched until consent is granted (no beacons, no config loads, no "anonymous"
   pings before opt-in).
4. **Input masking is unconditional.** Even with consent granted, SDK config
   must spread `MASKING_RULES` from `client/src/lib/consent.js`:
   - `maskAllInputs: true` — every text entry point (inputs, textareas,
     selects, contenteditable) is masked by default.
   - **Never record password, payment, or email fields** — enforced by the
     `blockSelector` (`input[type=password]`, `input[type=email]`,
     `input[type=tel]`, `autocomplete^=cc-` / card / email) plus the
     `data-recording="private"` / `.recording-private` opt-out markers that
     must be added to any sensitive custom field.
5. **No keystroke logging.** Do not install keydown/keypress capture
   listeners for analytics. If a vendor calls it "input analytics", it is
   prohibited here without an explicit per-field purpose review.
6. **No heatmaps / rage-click recording without consent.** Heatmaps, click
   maps, rage-click detection, and scroll tracking are recording; they follow
   the same opt-in gate and masking rules.
7. **Server-side Sentry stays replay-free.** `Sentry.init` must not enable
   `replaysSessionSampleRate` / `replaysOnErrorSampleRate` or the Replay
   integration. Error reports remain stack-trace-only. If client-side Sentry
   is ever added, `replayIntegration` may only be started after
   `recordingAllowed()` is true, with `MASKING_RULES` applied
   (`maskAllInputs`, blockSelector covering password/payment/email).

## Where the gate lives

- `client/src/lib/consent.js` — the only source of truth:
  `getRecordingConsent()`, `hasRecordingConsent()`, `recordingAllowed()`,
  `setRecordingConsent(bool)`, `revokeRecordingConsent()`,
  `onRecordingConsentChange(fn)`, and `MASKING_RULES`.
- `client/src/app/settings/general/page.jsx` — the user-facing switch
  ("Privacy" card, `role="switch"`, `aria-checked` reflects state).

## Verification

```bash
# No replay SDK may appear in dependencies:
grep -iE 'posthog|hotjar|fullstory|logrocket|clarity|mixpanel|rrweb|@sentry/replay' \
  client/package.json server/package.json

# No recording may start without the consent gate:
grep -rn "recordingAllowed\|hasRecordingConsent" client/src
```

Both are true as of the last review.
