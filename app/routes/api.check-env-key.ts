import type { LoaderFunction } from 'react-router';
import { LLMManager } from '~/lib/modules/llm/manager';

const ENV_KEY_ALIASES: Record<string, string[]> = {
  GOOGLE_GENERATIVE_AI_API_KEY: ['GEMINI_API_KEY'],
  OPEN_ROUTER_API_KEY: ['OPENROUTER_API_KEY'],
};

export const loader: LoaderFunction = async ({ context, request }) => {
  const url = new URL(request.url);
  const providerName = url.searchParams.get('provider');

  if (!providerName) {
    return Response.json(
      { isSet: false, source: 'none' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cloudflareEnv = context?.cloudflare?.env as unknown as Record<string, unknown> | undefined;
  const llmManager = LLMManager.getInstance(cloudflareEnv as Record<string, string> | undefined);
  const provider = llmManager.getProvider(providerName);

  if (!provider?.config.apiTokenKey) {
    return Response.json(
      { isSet: false, source: 'none' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const envNames = [provider.config.apiTokenKey, ...(ENV_KEY_ALIASES[provider.config.apiTokenKey] || [])];
  const hasServerSecret = envNames.some((name) => {
    const candidates = [cloudflareEnv?.[name], process.env[name], llmManager.env[name]];
    return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
  });

  // This endpoint reports server-owned credentials only. Browser cookies are
  // intentionally excluded so a user's saved key can never masquerade as a
  // Cloudflare Worker secret in the model selector.
  return Response.json(
    { isSet: hasServerSecret, source: hasServerSecret ? 'environment' : 'none' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
