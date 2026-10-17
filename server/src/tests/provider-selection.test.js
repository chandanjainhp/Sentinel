import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { getAIClient, getAIProviderName, getModelName, resetAIClient } from "../utils/anthropic.js";

/**
 * Sarvam as a first-class LLM provider.
 *
 * Same contract as every other provider: getAIProvider() selects it from
 * LLM_PROVIDER, getAIClient() returns a client whose messages.create() speaks
 * the Anthropic shape argus-explain.service.js consumes, and failures throw so
 * the service's existing retry-then-deterministic-fallback path handles them
 * exactly like an Anthropic/Mistral/OpenRouter/local failure.
 *
 * No real API is contacted: global fetch is stubbed, and selection is asserted
 * through the init logs + the request the stub captures.
 */

// Only these keys are mutated; each is saved and restored around every test
// so the shared bun test process keeps every variable other suites set.
const MANAGED_KEYS = [
  "MOCK_AI",
  "LLM_PROVIDER",
  "USE_LOCAL_LLM",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "LOCAL_LLM_MODEL",
  "LMSTUDIO_MODEL",
  "LMSTUDIO_MAX_TOKENS",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "MISTRAL_API_KEY",
  "MISTRAL_BASE_URL",
  "SARVAM_API_KEY",
  "SARVAM_MODEL",
  "SARVAM_BASE_URL",
];

// getAIProvider() forces 'local' under NODE_ENV=test; drop it so explicit
// provider selection is exercised the way it runs in dev/prod.
const originalNodeEnv = process.env.NODE_ENV;
delete process.env.NODE_ENV;
afterAll(() => {
  if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
  resetAIClient();
});

const capturedRequests = [];
let nextResponse = () => ({ ok: true, status: 200, json: () => ({}) });

// Saved before any test stubs anything; restored in afterEach so the bare
// fetch() calls other suites make (bun test = one process) are unaffected.
const originalFetch = globalThis.fetch;

const openAIChatCompletionPayload = () => ({
  id: "chatcmpl-test",
  model: "sarvam-105b-conversations",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: '{"summary":"ok"}' },
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
});

let savedEnv = new Map();

beforeEach(() => {
  savedEnv = new Map(
    MANAGED_KEYS.filter((key) => key in process.env).map((key) => [key, process.env[key]])
  );
  for (const key of MANAGED_KEYS) delete process.env[key];

  capturedRequests.length = 0;
  globalThis.fetch = async (input, init) => {
    capturedRequests.push({
      url: String(input),
      method: init?.method,
      headers: init?.headers || {},
      body: JSON.parse(init?.body || "{}"),
    });
    return nextResponse();
  };
  resetAIClient();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of MANAGED_KEYS) delete process.env[key];
  for (const [key, value] of savedEnv) process.env[key] = value;
  resetAIClient();
});

describe("sarvam provider selection", () => {
  it("LLM_PROVIDER=sarvam selects sarvam and initializes a key-bearing client", () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";

    expect(getAIProviderName()).toBe("sarvam");
    expect(getAIClient()).toBeTruthy();
  });

  it("is selected implicitly by SARVAM_API_KEY when LLM_PROVIDER is unset", () => {
    process.env.SARVAM_API_KEY = "test-key";

    expect(getAIProviderName()).toBe("sarvam");
  });

  it("explicit LLM_PROVIDER wins over other provider keys (same precedence as mistral)", () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    process.env.OPENROUTER_API_KEY = "or-key";

    expect(getAIProviderName()).toBe("sarvam");
  });

  it("default model is sarvam-105b-conversations, overridable via SARVAM_MODEL", () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    expect(getModelName()).toBe("sarvam-105b-conversations");

    resetAIClient();
    process.env.SARVAM_MODEL = "sarvam-105b";
    expect(getModelName()).toBe("sarvam-105b");
  });

  it("rejects the provider when the key is missing", () => {
    process.env.LLM_PROVIDER = "sarvam";
    delete process.env.SARVAM_API_KEY;

    expect(() => getAIClient()).toThrow("LLM_PROVIDER=sarvam requires SARVAM_API_KEY");
  });
});

describe("sarvam client (fetch stub)", () => {
  it("posts the Anthropic-shaped call to /v1/chat/completions with both auth headers", async () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    nextResponse = () => ({ ok: true, status: 200, json: openAIChatCompletionPayload });

    const response = await getAIClient().messages.create({
      model: getModelName(),
      max_tokens: 800,
      system: "You are Argus, an industrial reliability analyst.",
      messages: [{ role: "user", content: "INCIDENT ... SENSOR DATA ..." }],
    });

    expect(capturedRequests.length).toBe(1);
    const req = capturedRequests[0];

    expect(req.url).toBe("https://api.sarvam.ai/v1/chat/completions");
    expect(req.headers["api-subscription-key"]).toBe("test-key");
    expect(req.headers.Authorization).toBe("Bearer test-key");

    expect(req.body.model).toBe("sarvam-105b-conversations");
    expect(req.body.max_tokens).toBe(800);
    expect(req.body.messages).toEqual([
      { role: "system", content: "You are Argus, an industrial reliability analyst." },
      { role: "user", content: "INCIDENT ... SENSOR DATA ..." },
    ]);

    // Anthropic shape comes back out of the OpenAI-shaped payload, so the
    // Argus explain service consumes it unchanged.
    expect(response.stop_reason).toBe("end_turn");
    expect(response.content).toEqual([{ type: "text", text: '{"summary":"ok"}' }]);
    expect(response.usage).toEqual({ input_tokens: 11, output_tokens: 7 });
  });

  it("passes the configured model through to the request body", async () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_MODEL = "sarvam-105b";
    nextResponse = () => ({ ok: true, status: 200, json: openAIChatCompletionPayload });

    await getAIClient().messages.create({
      model: getModelName(),
      max_tokens: 800,
      messages: [{ role: "user", content: "hello" }],
    });

    expect(capturedRequests[0].body.model).toBe("sarvam-105b");
  });

  it("maps tool_use stops and tool calls into the Anthropic shape", async () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    nextResponse = () => ({
      ok: true,
      status: 200,
      json: () => ({
        id: "chatcmpl-tools",
        model: "sarvam-105b",
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "submit_classification", arguments: '{"severity":"harmless"}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    });

    const response = await getAIClient().messages.create({
      model: "sarvam-105b",
      max_tokens: 800,
      messages: [{ role: "user", content: "go" }],
    });

    expect(response.stop_reason).toBe("tool_use");
    expect(response.content).toEqual([
      { type: "tool_use", id: "call_1", name: "submit_classification", input: { severity: "harmless" } },
    ]);
  });

  it("throws a provider-tagged error on HTTP failure (service then retries → fallback)", async () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    nextResponse = () => ({
      ok: false,
      status: 429,
      text: () => '{"error":{"message":"Quota Exceeded","code":"rate_limit_exceeded_error"}}',
      json: () => ({}),
    });

    let thrown = null;
    try {
      await getAIClient().messages.create({
        model: "sarvam-105b-conversations",
        max_tokens: 800,
        messages: [{ role: "user", content: "hello" }],
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain("Sarvam error (429)");
    expect(thrown.message).toContain("rate_limit_exceeded_error");
    // Same exception contract as every other provider: it throws; the retry
    // and deterministic fallback live in argus-explain.service.js.
  });

  it("malformed JSON body surfaces as a thrown error like any other provider failure", async () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "test-key";
    nextResponse = () => ({ ok: true, status: 200, json: () => { throw new Error("Unexpected token < in JSON"); } });

    let thrown = null;
    try {
      await getAIClient().messages.create({
        model: "sarvam-105b-conversations",
        max_tokens: 800,
        messages: [{ role: "user", content: "hello" }],
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown?.message).toContain("Unexpected token");
  });
});
