import { z } from 'zod';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash-lite';
// LLM inference is slower than GitHub REST — intentionally higher than github-service's 10 s
const FETCH_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const MAX_INPUT_CHARS = 80_000;

export const RefinedContentSchema = z.object({
  website_content: z.string().describe('Markdown ottimizzato per SEO/GEO/AEO con FAQ e tabelle'),
  linkedin_post: z.string().describe('Post professionale con ganci di valore'),
  twitter_post: z.string().describe('Tweet tecnico e conciso'),
});

export type RefinedContent = z.infer<typeof RefinedContentSchema>;

class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function stripMarkdownFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '').trim();
}

function extractContent(data: unknown): string | null {
  if (
    data &&
    typeof data === 'object' &&
    'choices' in data &&
    Array.isArray((data as { choices: unknown[] }).choices)
  ) {
    const content = (
      data as { choices: Array<{ message?: { content?: unknown } }> }
    ).choices[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  }
  return null;
}

async function attempt(rawText: string, apiKey: string): Promise<RefinedContent> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a Software Architect and Technical Writer. Analyze the provided text and return ONLY a valid JSON object with exactly these keys: "website_content" (Markdown optimized for SEO/GEO/AEO with FAQ and tables), "linkedin_post" (professional post with value hooks), "twitter_post" (concise technical tweet). No markdown code blocks. No extra keys.',
        },
        { role: 'user', content: rawText },
      ],
    }),
  });

  if (res.status === 429 || res.status >= 500) throw new HttpError(res.status);
  if (!res.ok) throw new HttpError(res.status);

  const data: unknown = await res.json().catch(() => {
    throw new Error('Response body is not JSON');
  });

  const raw = extractContent(data);
  if (!raw) throw new Error('Empty model response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFences(raw));
  } catch {
    throw new Error('Model response is not valid JSON');
  }

  return RefinedContentSchema.parse(parsed);
}

export async function refineContent(rawText: string): Promise<RefinedContent | null> {
  const apiKey = import.meta.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[ai-service] OPENROUTER_API_KEY not set');
    return null;
  }

  const input =
    rawText.length > MAX_INPUT_CHARS
      ? (console.warn('[ai-service] input truncated from', rawText.length, 'chars'), rawText.slice(0, MAX_INPUT_CHARS))
      : rawText;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await attempt(input, apiKey);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : undefined;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (retryable && i < MAX_RETRIES - 1) {
        const delay = 1000 * 2 ** i;
        console.warn(`[ai-service] retry ${i + 1}/${MAX_RETRIES} after ${delay}ms — ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error('[ai-service] failed, skipping post:', (err as Error).message ?? err);
        return null;
      }
    }
  }
  return null;
}
