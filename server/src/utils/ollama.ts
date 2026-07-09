/**
 * Normalize the OLLAMA_HOST env var to a valid HTTP URL.
 * Handles common mis-configurations:
 *   "0.0.0.0"            → http://127.0.0.1:11434  (bind-all → loopback)
 *   "127.0.0.1"          → http://127.0.0.1:11434  (no scheme/port)
 *   "http://localhost"   → http://localhost:11434   (no port)
 */
export function normalizeOllamaHost(raw: string): string {
  let h = raw.trim()
    .replace(/^0\.0\.0\.0/, '127.0.0.1')
    .replace(/^\[::\]/, '127.0.0.1');
  if (!h.startsWith('http://') && !h.startsWith('https://')) h = `http://${h}`;
  if (!h.match(/:\d+\/?$/)) h = h.replace(/\/?$/, ':11434');
  return h.replace(/\/$/, '');
}

export const OLLAMA_HOST  = normalizeOllamaHost(process.env.OLLAMA_HOST  ?? 'localhost:11434');
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b';
