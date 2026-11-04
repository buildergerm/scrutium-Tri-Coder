/**
 * Environment-variable aliases retained for compatibility with deployed Workers.
 * The canonical provider config key is always listed first.
 */
export const API_TOKEN_ENV_ALIASES: Record<string, string[]> = {
  GOOGLE_GENERATIVE_AI_API_KEY: ['GEMINI_API_KEY'],
  OPEN_ROUTER_API_KEY: ['OPENROUTER_API_KEY'],
};

export function getApiTokenEnvKeys(primaryKey?: string): string[] {
  if (!primaryKey) return [];
  return [...new Set([primaryKey, ...(API_TOKEN_ENV_ALIASES[primaryKey] ?? [])])];
}

/** Read a server-owned token without ever returning it to client-facing routes. */
export function getServerApiToken(
  primaryKey: string | undefined,
  ...environments: Array<Record<string, unknown> | undefined>
): string | undefined {
  for (const key of getApiTokenEnvKeys(primaryKey)) {
    for (const environment of environments) {
      const value = environment?.[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  }
  return undefined;
}
