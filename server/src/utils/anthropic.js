/*
  AI Client Configuration - Supports both Anthropic and OpenRouter

  This module provides a singleton AI client that can use either:
  1. OpenRouter API (100+ models) - Recommended for testing
  2. Anthropic Claude API - If preferred

  Configuration:
  - For OpenRouter: Set OPENROUTER_API_KEY and OPENROUTER_MODEL in .env
  - For Anthropic: Set ANTHROPIC_API_KEY in .env
*/

import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';

let clientInstance = null;
let aiProvider = null;

const normalizeOpenRouterBaseURL = (rawBaseURL) => {
  const fallback = 'https://openrouter.ai/api/v1';
  const input = (rawBaseURL || fallback).trim();

  try {
    const url = new URL(input);
    // OpenRouter chat completions live under /api/v1/chat/completions.
    // Normalize configured values like:
    // - https://openrouter.ai
    // - https://openrouter.ai/v1
    // - https://openrouter.ai/api/v1
    // to a stable API base.
    url.pathname = '/api/v1';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
};

const anthropicToolsToOpenAITools = (tools = []) => {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }));
};

const anthropicMessagesToOpenAIMessages = (messages = []) => {
  const mapped = [];

  for (const message of messages) {
    const { role, content } = message;

    if (typeof content === 'string') {
      mapped.push({ role, content });
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    if (role === 'assistant') {
      const textBlocks = content.filter((block) => block?.type === 'text' && block?.text);
      const toolUseBlocks = content.filter((block) => block?.type === 'tool_use');

      const assistantMessage = {
        role: 'assistant',
        content: textBlocks.length > 0 ? textBlocks.map((block) => block.text).join('\n') : null,
      };

      if (toolUseBlocks.length > 0) {
        assistantMessage.tool_calls = toolUseBlocks.map((block) => ({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        }));
      }

      mapped.push(assistantMessage);
      continue;
    }

    if (role === 'user') {
      const textBlocks = content.filter((block) => block?.type === 'text' && block?.text);
      if (textBlocks.length > 0) {
        mapped.push({ role: 'user', content: textBlocks.map((block) => block.text).join('\n') });
      }

      for (const block of content) {
        if (block?.type !== 'tool_result') {
          continue;
        }

        const toolContent =
          typeof block.content === 'string' ? block.content : JSON.stringify(block.content || {});

        mapped.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: toolContent,
        });
      }
    }
  }

  return mapped;
};

const openAIResponseToAnthropicShape = (payload) => {
  const choice = payload?.choices?.[0] || {};
  const message = choice?.message || {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const contentBlocks = [];

  if (typeof message.content === 'string' && message.content.trim()) {
    contentBlocks.push({
      type: 'text',
      text: message.content,
    });
  }

  for (const toolCall of toolCalls) {
    let parsedInput = {};
    const rawArgs = toolCall?.function?.arguments;

    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        parsedInput = JSON.parse(rawArgs);
      } catch {
        parsedInput = { _raw: rawArgs };
      }
    }

    contentBlocks.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall?.function?.name,
      input: parsedInput,
    });
  }

  const finishReason = choice?.finish_reason;
  const stopReason = finishReason === 'tool_calls' ? 'tool_use' : 'end_turn';

  return {
    id: payload?.id,
    model: payload?.model,
    stop_reason: stopReason,
    content: contentBlocks,
    usage: {
      input_tokens: payload?.usage?.prompt_tokens || 0,
      output_tokens: payload?.usage?.completion_tokens || 0,
    },
  };
};

const OPENROUTER_TOOL_MODELS = new Set([
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3-haiku',
  'anthropic/claude-3.5-sonnet',
]);

const createOpenRouterCompatClient = ({ apiKey, baseURL }) => {
  const normalizedBase = normalizeOpenRouterBaseURL(baseURL);

  return {
    messages: {
      create: async ({ model, max_tokens, system, tools, tool_choice, messages }) => {
        const openAIMessages = [
          { role: 'system', content: system || '' },
          ...anthropicMessagesToOpenAIMessages(messages || []),
        ];

        const payload = {
          model,
          messages: openAIMessages,
          max_tokens,
        };

        if (Array.isArray(tools) && tools.length > 0) {
          payload.tools = anthropicToolsToOpenAITools(tools);
          payload.tool_choice = tool_choice?.type || 'auto';
        }

        const response = await fetch(`${normalizedBase}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(process.env.OPENROUTER_HTTP_REFERER
              ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER }
              : {}),
            ...(process.env.OPENROUTER_X_TITLE
              ? { 'X-Title': process.env.OPENROUTER_X_TITLE }
              : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenRouter error (${response.status}): ${text.slice(0, 500)}`);
        }

        const data = await response.json();
        return openAIResponseToAnthropicShape(data);
      },
    },
  };
};

/** OpenAI-compatible chat completions (LM Studio, Mistral, etc.). */
const createOpenAICompatClient = ({
  baseURL,
  apiKey,
  label = 'OpenAI-compat',
  maxTokensCap = null,
}) => {
  const base = (baseURL || 'http://localhost:1234/v1').replace(/\/$/, '');

  return {
    messages: {
      create: async ({ model, max_tokens, system, tools, tool_choice, messages }) => {
        if (Number.isFinite(maxTokensCap)) {
          max_tokens = Math.min(max_tokens, maxTokensCap);
        }
        const openAIMessages = [
          { role: 'system', content: system || '' },
          ...anthropicMessagesToOpenAIMessages(messages || []),
        ];

        const payload = { model, messages: openAIMessages, max_tokens };

        if (Array.isArray(tools) && tools.length > 0) {
          payload.tools = anthropicToolsToOpenAITools(tools);
          payload.tool_choice = tool_choice?.type || 'auto';
        }

        const body = JSON.stringify(payload);
        console.log(`[${label}] payload chars=${body.length} msgs=${openAIMessages.length} max_tokens=${max_tokens}`);
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${label} error (${response.status}): ${text.slice(0, 500)}`);
        }

        const data = await response.json();
        return openAIResponseToAnthropicShape(data);
      },
    },
  };
};

const createMockAIClient = () => {
  return {
    messages: {
      create: async ({ messages, tools }) => {
        const hasTools = Array.isArray(tools) && tools.length > 0;
        if (!hasTools) {
          const userText = String(messages?.find((m) => m.role === 'user')?.content || '');
          const sectionMatch = userText.match(/Section: (.+)/);
          const sectionTitle = sectionMatch?.[1]?.trim() || 'Briefing section';
          const reasoningLines = [...userText.matchAll(/Reasoning: ([^\n;]+)/g)].map((m) => m[1].trim());
          const prose = reasoningLines.length
            ? `${sectionTitle}: ${reasoningLines.join('. ')}.`
            : `${sectionTitle} summary for overnight operations.`;

          return {
            id: `msg_mock_brief_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: prose }],
            usage: { input_tokens: 100, output_tokens: 50 },
          };
        }

        const assistantMsgs = messages.filter(m => m.role === 'assistant');
        const count = assistantMsgs.length;

        if (count === 0) {
          return {
            id: `msg_mock_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'text',
                text: 'Starting investigation. I will gather the overnight alerts first.'
              },
              {
                type: 'tool_use',
                id: `toolu_mock_alerts_${Date.now()}`,
                name: 'get_overnight_alerts',
                input: {}
              }
            ],
            usage: { input_tokens: 100, output_tokens: 50 }
          };
        } else if (count === 1) {
          const Incident = mongoose.model('Incident');
          const incident = await Incident.findOne({ nightDate: '2026-07-11' }).lean();
          const realIncidentId = incident ? incident._id.toString() : '6a4a05b5955079335b85f5f6';

          return {
            id: `msg_mock_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'text',
                text: 'Based on the alerts, the activity is harmless. I will submit the classification.'
              },
              {
                type: 'tool_use',
                id: `toolu_mock_submit_${Date.now()}`,
                name: 'submit_classification',
                input: {
                  incidentId: realIncidentId,
                  severity: 'harmless',
                  confidence: 0.95,
                  reasoning: 'Sensor alert was investigated and found to be normal baseline activity.',
                  uncertainties: []
                }
              }
            ],
            usage: { input_tokens: 200, output_tokens: 80 }
          };
        } else {
          return {
            id: `msg_mock_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            stop_reason: 'end_turn',
            content: [
              {
                type: 'text',
                text: 'Investigation is complete.\n\n```json\n{\n  "severity": "harmless",\n  "confidence": 0.95,\n  "reasoning": "Sensor alert was investigated and found to be normal baseline activity.",\n  "uncertainties": []\n}\n```'
              }
            ],
            usage: { input_tokens: 300, output_tokens: 100 }
          };
        }
      }
    }
  };
};

/**
 * @returns {'openrouter' | 'anthropic' | 'local' | 'mistral' | 'mock'}
 */
const getAIProvider = () => {
  if (process.env.MOCK_AI === 'true') {
    return 'mock';
  }

  const explicit = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'mistral' || explicit === 'anthropic' || explicit === 'openrouter') {
    return explicit;
  }
  if (explicit === 'local' || explicit === 'lmstudio') {
    return 'local';
  }

  // Backward compat when LLM_PROVIDER unset
  if (process.env.USE_LOCAL_LLM === 'true' || process.env.NODE_ENV === 'test') {
    return 'local';
  }
  if (process.env.OPENROUTER_API_KEY) {
    return 'openrouter';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (process.env.MISTRAL_API_KEY) {
    return 'mistral';
  }
  if (process.env.OPENAI_BASE_URL) {
    return 'local';
  }
  throw new Error(
    'No AI provider configured. Set LLM_PROVIDER=anthropic|local|mistral (or USE_LOCAL_LLM / API keys) in .env'
  );
};

/**
 * Get or create the AI client singleton
 * Supports both OpenRouter and Anthropic Claude APIs
 * @returns {Anthropic} AI API client (compatible Anthropic SDK)
 */
export const getAIClient = () => {
  if (!clientInstance) {
    aiProvider = getAIProvider();

    if (aiProvider === 'mock') {
      console.log('[AI] Initializing Mock AI Client...');
      clientInstance = createMockAIClient();
    } else if (aiProvider === 'openrouter') {
      console.log('[AI] Initializing OpenRouter client...');
      const baseURL = normalizeOpenRouterBaseURL(process.env.OPENROUTER_BASE_URL);
      clientInstance = createOpenRouterCompatClient({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL,
      });
      console.log(
        `[AI] ✅ OpenRouter initialized - Model: ${
          process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo'
        } | Base URL: ${baseURL}`
      );
    } else if (aiProvider === 'anthropic') {
      console.log('[AI] Initializing Anthropic Claude client...');
      clientInstance = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      console.log('[AI] ✅ Anthropic Claude initialized');
    } else if (aiProvider === 'local') {
      console.log('[AI] Initializing local OpenAI-compat client (LM Studio)...');
      clientInstance = createOpenAICompatClient({
        baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:1234/v1',
        apiKey: process.env.OPENAI_API_KEY || 'lm-studio',
        label: 'LM Studio',
        maxTokensCap: parseInt(process.env.LMSTUDIO_MAX_TOKENS || '800', 10),
      });
      console.log(
        `[AI] ✅ Local LLM - Model: ${
          process.env.LOCAL_LLM_MODEL || process.env.LMSTUDIO_MODEL || 'qwen2.5-7b-instruct'
        } | Base URL: ${process.env.OPENAI_BASE_URL || 'http://localhost:1234/v1'}`
      );
    } else if (aiProvider === 'mistral') {
      if (!process.env.MISTRAL_API_KEY) {
        throw new Error('LLM_PROVIDER=mistral requires MISTRAL_API_KEY');
      }
      const baseURL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';
      console.log('[AI] Initializing Mistral client...');
      clientInstance = createOpenAICompatClient({
        baseURL,
        apiKey: process.env.MISTRAL_API_KEY,
        label: 'Mistral',
      });
      console.log(
        `[AI] ✅ Mistral initialized - Model: ${
          process.env.MISTRAL_MODEL || 'mistral-large-latest'
        } | Base URL: ${baseURL}`
      );
    }
  }
  return clientInstance;
};

/**
 * Get the current AI provider name for logging/debugging
 * @returns {'openrouter' | 'anthropic'} The AI provider in use
 */
export const getAIProviderName = () => {
  if (!aiProvider) {
    aiProvider = getAIProvider();
  }
  return aiProvider;
};

/**
 * Get the model name being used
 * @returns {string} Model identifier
 */
export const getModelName = () => {
  const provider = getAIProviderName();

  if (provider === 'openrouter') {
    const configuredModel = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';

    if (!OPENROUTER_TOOL_MODELS.has(configuredModel)) {
      console.warn(
        `[AI] OPENROUTER_MODEL ${configuredModel} may not satisfy tool-calling constraints here. Falling back to anthropic/claude-sonnet-4`
      );
      return 'anthropic/claude-sonnet-4';
    }

    return configuredModel;
  }

  if (provider === 'local') {
    return process.env.LOCAL_LLM_MODEL || process.env.LMSTUDIO_MODEL || 'qwen2.5-7b-instruct';
  }

  if (provider === 'mistral') {
    return process.env.MISTRAL_MODEL || 'mistral-large-latest';
  }

  // Anthropic uses claude-3-sonnet by default
  return 'claude-3-sonnet-20240229';
};

/** Reset singleton — tests / hot env switches only. */
export const resetAIClient = () => {
  clientInstance = null;
  aiProvider = null;
};

// Backwards compatibility
export const getClaudeClient = getAIClient;

export default {
  getAIClient,
  getClaudeClient,
  getAIProviderName,
  getModelName,
  resetAIClient,
};
