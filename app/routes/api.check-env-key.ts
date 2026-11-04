import type { LoaderFunction } from 'react-router';
import { getServerApiToken } from '~/lib/modules/llm/api-token-env';
import { LLMManager } from '~/lib/modules/llm/manager';

/*
 * Resolve provider metadata from the registry, but read the secret directly
 * from the request's Cloudflare bindings. The status endpoint intentionally
 * returns only a boolean and never serializes a credential.
 */
const PROVIDER_API_TOKEN_KEYS: Record<string, string> = {
  OpenRouter: 'OPEN_ROUTER_API_KEY',
  Google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export const loader: LoaderFunction = async ({ context, request }) => {
  const providerName = new URL(request.url).searchParams.get('provider');

  if (!providerName) {
    return Response.json(
      { isSet: false, source: 'none', reason: 'provider_required' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const runtimeContext = context as typeof context & {
    env?: Record<string, unknown>;
    cloudflare?: { env?: Record<string, unknown> };
  };
  const cloudflareEnv = runtimeContext.cloudflare?.env ?? runtimeContext.env;
  const llmManager = LLMManager.getInstance(cloudflareEnv as Record<string, string> | undefined);
  const provider = llmManager.getProvider(providerName);
  const primaryKey = PROVIDER_API_TOKEN_KEYS[providerName] ?? provider?.config.apiTokenKey;
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  const serverApiKey = getServerApiToken(primaryKey, cloudflareEnv, processEnv, llmManager.env);

  return Response.json(
    {
      isSet: Boolean(serverApiKey),
      source: serverApiKey ? 'environment' : 'none',
      reason: serverApiKey ? 'server_credential_found' : primaryKey ? 'server_credential_missing' : 'provider_not_supported',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
