#!/usr/bin/env bun
/**
 * sarvam-test — ONE standalone chat-completion call to prove the Sarvam API works.
 * Not wired into the app. Run from server/:
 *
 *   bun scripts/sarvam-test.mjs
 *
 * Reads SARVAM_API_KEY from server/.env.sarvam.local (never hardcoded or printed).
 */

import { SarvamAIClient } from 'sarvamai';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.sarvam.local' });

const MODEL = 'sarvam-105b-conversations';

const apiKey = process.env.SARVAM_API_KEY?.trim();
if (!apiKey) {
  console.error('SARVAM_API_KEY is not set. Paste your key into server/.env.sarvam.local and run again.');
  process.exit(1);
}

const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

const response = await client.chat.completions({
  model: MODEL,
  messages: [{ role: 'user', content: 'Reply with exactly: Sarvam connection OK' }],
});

console.log(response.choices[0].message.content);
