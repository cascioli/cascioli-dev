export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET({ request }: APIContext) {
  const secret = import.meta.env.API_SECRET;
  const auth   = request.headers.get('Authorization') ?? '';

  if (!secret || auth !== `Bearer ${secret}`) {
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
