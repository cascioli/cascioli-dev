// Schemas must be kept in sync with src/content.config.ts
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { z } from 'zod';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const notesSchema = z.object({
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
});

const projectsSchema = z.object({
  name:                z.string(),
  folder:              z.enum(['web-apps', 'open-source', 'experiments', 'archive']),
  title:               z.string(),
  description:         z.string(),
  desc:                z.string(),
  stack:               z.array(z.string()),
  year:                z.number().int(),
  status:              z.enum(['production', 'wip', 'archived', 'beta']),
  featured:            z.boolean().default(false),
  applicationCategory: z.string().optional(),
  links: z.object({
    github: z.string().refine(v => !v.startsWith('http'), { message: 'store bare hostname, e.g. github.com/user/repo' }).nullable().default(null),
    demo:   z.string().refine(v => !v.startsWith('http'), { message: 'store bare hostname, e.g. myapp.com' }).nullable().default(null),
  }),
  image:        z.string().optional(),
  keywords:     z.array(z.string()).optional(),
  lastModified: z.coerce.date().optional(),
  ogImage:      z.string().optional(),
});

async function listMdFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await listMdFiles(full));
    else if (e.name.endsWith('.md')) files.push(full);
  }
  return files;
}

async function validateCollection(dir, schema, label) {
  let errors = 0;
  const files = await listMdFiles(dir);
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { data } = matter(raw);
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`\n[${label}] ${file.replace(ROOT, '')}:`);
      for (const issue of result.error.issues) {
        const path = issue.path.length ? issue.path.join('.') : '(root)';
        console.error(`  ✗ ${path}: ${issue.message}`);
      }
      errors++;
    }
  }
  return errors;
}

const total =
  (await validateCollection(join(ROOT, 'src/content/notes'),    notesSchema,    'notes')) +
  (await validateCollection(join(ROOT, 'src/content/projects'), projectsSchema, 'projects'));

if (total > 0) {
  console.error(`\n✗ ${total} file(s) failed schema validation. Fix before building.\n`);
  process.exit(1);
} else {
  console.log('✓ All content files pass schema validation.');
}
