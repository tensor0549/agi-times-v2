export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  POSTHOG_HOST: string;
  POSTHOG_API_KEY?: string;
  RATE_LIMIT_SALT?: string;
};
