/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly GITHUB_TOKEN?: string;
  readonly GITHUB_USERNAME?: string;
  readonly OPENROUTER_API_KEY?: string;
  readonly API_SECRET: string;
  readonly TWITTER_API_KEY?: string;
  readonly TWITTER_API_SECRET?: string;
  readonly TWITTER_ACCESS_TOKEN?: string;
  readonly TWITTER_ACCESS_SECRET?: string;
  readonly LINKEDIN_ACCESS_TOKEN?: string;
  readonly LINKEDIN_PERSON_URN?: string;
}
