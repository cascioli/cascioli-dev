import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notesCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title:       z.string(),
    description: z.string(),
    preview:     z.string(),
    tag:         z.enum(['flutter-arch', 'ai-engineering', 'cybersecurity', 'independent-dev']),
    date:        z.coerce.date(),
    readMin:     z.number().int().positive(),
    featured:    z.boolean().optional().default(false),
    ogImage:     z.string().optional(),
  }),
});

const projectsCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    name:        z.string(),
    folder:      z.enum(['web-apps', 'open-source', 'experiments', 'archive']),
    title:       z.string(),
    description: z.string(),
    desc:        z.string(),
    stack:       z.array(z.string()),
    year:        z.number().int(),
    status:      z.enum(['production', 'wip', 'archived', 'beta']),
    featured:             z.boolean().default(false),
    applicationCategory:  z.string().optional(),
    links:       z.object({
      github: z.string().nullable().default(null),
      demo:   z.string().nullable().default(null),
    }),
    ogImage:     z.string().optional(),
  }),
});

export const collections = {
  notes:    notesCollection,
  projects: projectsCollection,
};
