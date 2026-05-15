import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_API      = 'https://api.github.com';
const RAW_GITHUB      = 'https://raw.githubusercontent.com';
const FETCH_TIMEOUT   = 10_000;

const ROOT       = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_DIR  = join(ROOT, '.cache');
const CACHE_FILE = join(CACHE_DIR, 'github-content.json');

// Compared against lowercased path strings — keep lowercase.
const CONTENT_DIRS = ['til/', 'notes/', 'docs/'];
const CONTENT_EXTS = ['.md', '.mdx'];

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * `content` is raw, untrusted Markdown fetched from a public GitHub repo.
 * Sanitize before rendering as HTML.
 */
export type GithubContentItem = {
  content: string;
  metadata: {
    repoName: string;
    stars: number;
    techStack: string[];
  };
  originalPath: string;
};

// ── Internal types ────────────────────────────────────────────────────────────

type GitHubRepo = {
  name: string;
  stargazers_count: number;
  topics: string[];
  language: string | null;
  default_branch: string;
};

type GitHubSearchResponse = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
};

type GitHubTreeEntry = { path: string; type: 'blob' | 'tree' };

type GitHubTree = { tree: GitHubTreeEntry[]; truncated: boolean };

type GitHubBranchResponse = {
  commit: {
    sha: string;               // HEAD commit SHA — used as cache key
    commit: {                  // raw git commit data
      tree: { sha: string };   // tree SHA for /git/trees lookup
    };
  };
};

type CacheEntry = { headSha: string; items: GithubContentItem[] };
type Cache      = Record<string, CacheEntry>;

// ── Runtime type guards ───────────────────────────────────────────────────────

function isGitHubRepo(v: unknown): v is GitHubRepo {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.stargazers_count === 'number' &&
    Array.isArray(r.topics) &&
    typeof r.default_branch === 'string'
  );
}

function isGitHubSearchResponse(v: unknown): v is GitHubSearchResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.total_count === 'number' &&
    typeof r.incomplete_results === 'boolean' &&
    Array.isArray(r.items) &&
    (r.items as unknown[]).every(isGitHubRepo)
  );
}

function isGitHubTree(v: unknown): v is GitHubTree {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r.tree) && typeof r.truncated === 'boolean';
}

function isGitHubBranchResponse(v: unknown): v is GitHubBranchResponse {
  if (typeof v !== 'object' || v === null) return false;
  const outerCommit = (v as Record<string, unknown>).commit;
  if (typeof outerCommit !== 'object' || outerCommit === null) return false;
  const oc = outerCommit as Record<string, unknown>;
  if (typeof oc.sha !== 'string') return false;
  const innerCommit = oc.commit;
  if (typeof innerCommit !== 'object' || innerCommit === null) return false;
  const tree = (innerCommit as Record<string, unknown>).tree;
  if (typeof tree !== 'object' || tree === null) return false;
  return typeof (tree as Record<string, unknown>).sha === 'string';
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function readCache(): Promise<Cache> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  }
}

async function writeCache(cache: Cache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[github-service] failed to write cache:', err);
  }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const token = import.meta.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function safeJson<T>(
  url: string,
  headers: Record<string, string>,
  guard: (v: unknown) => v is T,
): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) {
      const reset     = res.headers.get('X-RateLimit-Reset');
      const resetTime = reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown';
      console.warn(`[github-service] rate limited at ${url}. Resets at ${resetTime}`);
      return null;
    }
    if (!res.ok) {
      console.warn(`[github-service] ${res.status} ${url}`);
      return null;
    }
    const body: unknown = await res.json();
    if (!guard(body)) {
      console.warn(`[github-service] unexpected response shape at ${url}`);
      return null;
    }
    return body;
  } catch (err) {
    console.warn(`[github-service] network error ${url}:`, err);
    return null;
  }
}

async function fetchRawText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) {
      console.warn(`[github-service] raw fetch ${res.status} ${url}`);
      return null;
    }
    return res.text();
  } catch (err) {
    console.warn(`[github-service] raw network error ${url}:`, err);
    return null;
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchPortfolioRepos(
  username: string,
  headers: Record<string, string>,
): Promise<GitHubRepo[]> {
  const res = await safeJson<GitHubSearchResponse>(
    `${GITHUB_API}/search/repositories?q=user:${username}+topic:portfolio&per_page=100`,
    headers,
    isGitHubSearchResponse,
  );
  if (!res) return [];
  if (res.total_count > res.items.length) {
    console.warn(
      `[github-service] ${res.total_count} portfolio repos found but only ${res.items.length} fetched — pagination not implemented`,
    );
  }
  return res.items;
}

async function getBranchInfo(
  username: string,
  repo: string,
  branch: string,
  headers: Record<string, string>,
): Promise<{ headSha: string; treeSha: string } | null> {
  const data = await safeJson<GitHubBranchResponse>(
    `${GITHUB_API}/repos/${username}/${repo}/branches/${branch}`,
    headers,
    isGitHubBranchResponse,
  );
  if (!data) return null;
  return { headSha: data.commit.sha, treeSha: data.commit.commit.tree.sha };
}

async function fetchContentPaths(
  username: string,
  repo: string,
  treeSha: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const tree = await safeJson<GitHubTree>(
    `${GITHUB_API}/repos/${username}/${repo}/git/trees/${treeSha}?recursive=1`,
    headers,
    isGitHubTree,
  );
  if (!tree) return [];
  if (tree.truncated) {
    console.warn(`[github-service] git tree truncated for ${repo} — some files skipped`);
  }
  return tree.tree
    .filter(e => {
      const p = e.path.toLowerCase();
      return (
        e.type === 'blob' &&
        CONTENT_EXTS.some(ext => p.endsWith(ext)) &&
        CONTENT_DIRS.some(dir => p.startsWith(dir))
      );
    })
    .map(e => e.path);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchPortfolioContent(): Promise<GithubContentItem[]> {
  const username = import.meta.env.GITHUB_USERNAME;
  if (!username) {
    console.warn('[github-service] GITHUB_USERNAME not set — skipping GitHub fetch');
    return [];
  }

  const headers      = buildHeaders();
  const cache        = await readCache();
  const repos        = await fetchPortfolioRepos(username, headers);
  const items: GithubContentItem[] = [];
  let cacheUpdated   = false;

  for (const repo of repos) {
    const techStack = [
      ...repo.topics.filter(t => t !== 'portfolio'),
      ...(repo.language ? [repo.language] : []),
    ];
    const metadata = Object.freeze({ repoName: repo.name, stars: repo.stargazers_count, techStack });

    const branchInfo = await getBranchInfo(username, repo.name, repo.default_branch, headers);

    if (branchInfo && cache[repo.name]?.headSha === branchInfo.headSha) {
      console.log(`[github-service] cache hit: ${repo.name} (${branchInfo.headSha.slice(0, 7)})`);
      items.push(...cache[repo.name].items);
      continue;
    }

    const repoItems: GithubContentItem[] = [];

    // README attempted independently — included even when tree traversal is unavailable
    const readme = await fetchRawText(
      `${RAW_GITHUB}/${username}/${repo.name}/${repo.default_branch}/README.md`,
    );
    if (readme) repoItems.push({ content: readme, metadata, originalPath: 'README.md' });

    if (branchInfo) {
      const paths = await fetchContentPaths(username, repo.name, branchInfo.treeSha, headers);
      for (const path of paths) {
        const content = await fetchRawText(
          `${RAW_GITHUB}/${username}/${repo.name}/${repo.default_branch}/${path}`,
        );
        if (content) repoItems.push({ content, metadata, originalPath: path });
      }
      // Only cache when headSha is known — ensures cache key is reliable
      cache[repo.name] = { headSha: branchInfo.headSha, items: repoItems };
      cacheUpdated = true;
    }

    items.push(...repoItems);
  }

  if (cacheUpdated) await writeCache(cache);
  return items;
}
