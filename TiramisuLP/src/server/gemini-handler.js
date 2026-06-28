import { AI_SYSTEM_PROMPT } from '../ai-system-prompt.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function getGeminiConfig(env = process.env) {
  return {
    apiKey: env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || env.VITE_GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  };
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

export async function handleGeminiHttpRequest(req, res, env = process.env) {
  if (req.method === 'GET') {
    const { apiKey, model } = getGeminiConfig(env);
    return json(res, 200, {
      ok: true,
      configured: Boolean(apiKey),
      model,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  if (!body) {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return json(res, 400, { error: 'Prompt is required' });
  }

  const { apiKey, model } = getGeminiConfig(env);
  if (!apiKey) {
    return json(res, 500, { error: 'Gemini API key is not configured' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [{ text: AI_SYSTEM_PROMPT }],
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || 'Gemini request failed';
      return json(res, response.status, { error: message });
    }

    const text = extractGeminiText(data);
    if (!text) {
      return json(res, 502, { error: 'Gemini response was empty' });
    }

    return json(res, 200, { text });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return json(res, isAbort ? 504 : 500, {
      error: isAbort ? 'Gemini request timed out' : 'Unexpected server error',
    });
  }
}
