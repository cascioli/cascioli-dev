import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'node:fs';

const LOG_PATH = 'social_published_log.json';
const FEED_URL = 'https://simonecascioli.it/api/social-feed.json';

const REQUIRED_ENV = [
  'API_SECRET',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
  'LINKEDIN_ACCESS_TOKEN',
  'LINKEDIN_PERSON_URN',
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const API_SECRET            = process.env.API_SECRET!;
const TWITTER_API_KEY       = process.env.TWITTER_API_KEY!;
const TWITTER_API_SECRET    = process.env.TWITTER_API_SECRET!;
const TWITTER_ACCESS_TOKEN  = process.env.TWITTER_ACCESS_TOKEN!;
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET!;
const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN!;
const LINKEDIN_PERSON_URN   = process.env.LINKEDIN_PERSON_URN!;

type FeedItem = {
  id:            string;
  repoName:      string;
  stars:         number;
  techStack:     string[];
  originalPath:  string;
  linkedin_post: string;
  twitter_post:  string;
};

type LogEntry = {
  twitter?:  { id: string; publishedAt: string };
  linkedin?: { id: string; publishedAt: string };
};

type Log = Record<string, LogEntry>;

async function fetchFeed(): Promise<FeedItem[]> {
  const res = await fetch(FEED_URL, {
    signal:  AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${API_SECRET}` },
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  return res.json() as Promise<FeedItem[]>;
}

async function postTwitter(client: TwitterApi, text: string): Promise<string> {
  const { data } = await client.v2.tweet(text);
  return data.id;
}

async function postLinkedIn(text: string): Promise<string> {
  const body = {
    author:         LINKEDIN_PERSON_URN,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary:    { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method:  'POST',
    headers: {
      Authorization:               `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'Content-Type':              'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`LinkedIn post failed: ${res.status} ${await res.text()}`);

  const id = res.headers.get('X-RestLi-Id') ?? res.headers.get('x-restli-id');
  if (!id) throw new Error(`LinkedIn post succeeded (${res.status}) but returned no post ID`);
  return id;
}

async function main() {
  const feed = await fetchFeed();
  const log: Log = JSON.parse(readFileSync(LOG_PATH, 'utf-8'));

  const unpublished = feed.filter(item => {
    const entry = log[item.id];
    return !entry?.twitter || !entry?.linkedin;
  });

  if (!unpublished.length) {
    console.log('Nothing to publish.');
    return;
  }

  const twitter = new TwitterApi({
    appKey:       TWITTER_API_KEY,
    appSecret:    TWITTER_API_SECRET,
    accessToken:  TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_SECRET,
  });

  for (const item of unpublished) {
    const entry: LogEntry = log[item.id] ?? {};

    if (!entry.twitter) {
      try {
        const tweetId = await postTwitter(twitter, item.twitter_post);
        entry.twitter = { id: tweetId, publishedAt: new Date().toISOString() };
        console.log(`✓ Twitter [${item.id}] tweet ${tweetId}`);
      } catch (err) {
        console.error(`✗ Twitter [${item.id}]:`, err);
      }
    }

    if (!entry.linkedin) {
      try {
        const postId = await postLinkedIn(item.linkedin_post);
        entry.linkedin = { id: postId, publishedAt: new Date().toISOString() };
        console.log(`✓ LinkedIn [${item.id}] post ${postId}`);
      } catch (err) {
        console.error(`✗ LinkedIn [${item.id}]:`, err);
      }
    }

    // Write after each item — partial progress survives a crash
    if (entry.twitter || entry.linkedin) {
      log[item.id] = entry;
      writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
