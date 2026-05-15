import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  if (!context.site) throw new Error('site must be set in astro.config.mjs to generate RSS');
  const notes = await getCollection('notes');
  return rss({
    title: 'Note di Simone Cascioli',
    description: 'Saggi brevi, frammenti di codice, idee a metà. Flutter, Go, AI engineering, cybersecurity.',
    site: context.site,
    items: notes
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
      .map(note => ({
        title:       note.data.title,
        pubDate:     note.data.date,
        description: note.data.description,
        link:        `/notes/${note.id}`,
      })),
    customData: '<language>it-it</language>',
  });
}
