import type { Loader } from 'astro/loaders';
import { fetchPortfolioContent } from './github-service';
import { refineContent } from './ai-service';

const L = '[github-ai-loader]';

export function githubAiLoader(): Loader {
  return {
    name: 'github-ai-loader',
    async load({ store, meta, logger, generateDigest }) {
      logger.info(`${L} Fetching GitHub portfolio content...`);

      let items;
      try {
        items = await fetchPortfolioContent();
      } catch (err) {
        logger.error(`${L} GitHub fetch failed: ${err}`);
        return;
      }

      if (!items.length) {
        logger.warn(`${L} No items found — check GITHUB_USERNAME and topic:portfolio tag.`);
        return;
      }

      logger.info(`${L} ${items.length} items fetched.`);

      // Run cache checks and AI calls concurrently across all items.
      // store/meta reads are sync and happen before each item's first await.
      const results = await Promise.all(
        items.map(async (item) => {
          // Use '/' as separator — GitHub repo names never contain '/', so first segment is always the repo.
          const id = `${item.metadata.repoName}/${item.originalPath.replace(/\\/g, '/').replace(/^\/+/, '')}`;

          const currentHash = generateDigest(item.content);
          const storedHash  = meta.get(id);
          const existing    = store.get(id);

          if (storedHash === currentHash && existing) {
            logger.info(`${L} Cache hit: ${id}`);
            return { type: 'hit' as const, id, existing };
          }

          // Stale meta: hash matched but entry was evicted — clear so next build re-hashes cleanly.
          if (storedHash === currentHash && !existing) {
            meta.delete(id);
          }

          logger.info(`${L} AI processing: ${id}`);
          const aiContent = await refineContent(item.content);
          if (!aiContent) logger.warn(`${L} AI failed for ${id} — stored without aiContent.`);

          return { type: 'miss' as const, id, item, currentHash, aiContent };
        }),
      );

      for (const result of results) {
        if (result.type === 'hit') {
          // Spread full DataEntry to preserve body, digest, rendered — Astro wipes the store each load.
          store.set({ ...result.existing });
          continue;
        }

        const { id, item, currentHash, aiContent } = result;

        const stored = store.set({
          id,
          data: {
            repoName:     item.metadata.repoName,
            stars:        item.metadata.stars,
            techStack:    item.metadata.techStack,
            originalPath: item.originalPath,
            ...(aiContent ? { aiContent } : {}),
          },
          body: item.content,
        });

        if (stored) {
          meta.set(id, currentHash);
        } else {
          logger.warn(`${L} store.set rejected ${id} — will retry next build.`);
        }
      }
    },
  };
}
