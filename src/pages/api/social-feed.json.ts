export const prerender = false;

import { timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET({ request }: APIContext) {
  const secret = import.meta.env.API_SECRET;

  if (!secret) {
    console.error('[social-feed] API_SECRET is not configured');
    return new Response(JSON.stringify({ error: 'server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = request.headers.get('Authorization') ?? '';
  if (!safeCompare(auth, `Bearer ${secret}`)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entries = await getCollection('github_notes');

  const feed = entries
    .filter(e => e.data.aiContent?.linkedin_post && e.data.aiContent?.twitter_post)
    .map(e => ({
      id:            e.id,
      repoName:      e.data.repoName,
      stars:         e.data.stars,
      techStack:     e.data.techStack,
      originalPath:  e.data.originalPath,
      linkedin_post: e.data.aiContent!.linkedin_post,
      twitter_post:  e.data.aiContent!.twitter_post,
    }));

  return new Response(JSON.stringify(feed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
