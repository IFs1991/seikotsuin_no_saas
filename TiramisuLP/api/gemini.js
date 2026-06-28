import { handleGeminiHttpRequest } from '../src/server/gemini-handler.js';

export default async function handler(req, res) {
  return handleGeminiHttpRequest(req, res, process.env);
}
