import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
// import { githubAiLoader } from './lib/loaders';

const notesCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title:        z.string(),
    description:  z.string(),
    preview:      z.string(),
    tags:         z.array(z.enum(['flutter-arch', 'ai-engineering', 'cybersecurity', 'independent-dev'])),
    date:         z.coerce.date(),
    readMin:      z.number().int().positive(),
    draft:        z.boolean().optional().default(false),
    featured:     z.boolean().optional().default(false),
    keywords:     z.array(z.string()).optional(),
    lastModified: z.coerce.date().optional(),
    ogImage:      z.string().optional(),
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
      github: z.string().refine(v => !v.startsWith('http'), { message: 'store bare hostname, e.g. github.com/user/repo' }).nullable().default(null),
      demo:   z.string().refine(v => !v.startsWith('http'), { message: 'store bare hostname, e.g. myapp.com' }).nullable().default(null),
    }),
    image:        z.string().optional(),
    keywords:     z.array(z.string()).optional(),
    lastModified: z.coerce.date().optional(),
    ogImage:      z.string().optional(),
  }),
});

// const githubNotesCollection = defineCollection({
//   loader: githubAiLoader(),
//   schema: z.object({
//     repoName:     z.string(),
//     stars:        z.number(),
//     techStack:    z.array(z.string()),
//     originalPath: z.string(),
//     aiContent: z.object({
//       website_content: z.string().min(1),
//       linkedin_post:   z.string().min(1),
//       twitter_post:    z.string().min(1),
//     }).optional(),
//   }),
// });

export const collections = {
  notes:        notesCollection,
  projects:     projectsCollection,
  // github_notes: githubNotesCollection,
};
