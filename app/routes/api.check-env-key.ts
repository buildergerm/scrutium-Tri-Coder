import type { LoaderFunction } from 'react-router';
import { LLMManager } from '~/lib/modules/llm/manager';

// Resolve commonly used provider bindings directly so status detection does
// not depend on provider registration having completed in the LLM manager.
const PROVIDER_API_TOKEN_KEYS: Record<string, string[]> = {
  OpenRouter: ['OPEN_ROUTER_API_KEY', 'OPENROUTER_API_KEY'],
  Google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
};

export const loader: LoaderFunction = async ({ context, request }) => {
  const providerName = new URL(request.url).searchParams.get('provider');

  if (!providerName) {
    return Response.json(
      { isSet: false, source: 'none', reason: 'provider_required' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cloudflareEnv = context?.cloudflare?.env as unknown as Record<string, unknown> | undefined;
  const llmManager = LLMManager.getInstance(cloudflareEnv as Record<string, string> | undefined);
  const provider = llmManager.getProvider(providerName);
  const envNames =
    PROVIDER_API_TOKEN_KEYS[providerName] ??
    (provider?.config.apiTokenKey ? [provider.config.apiTokenKey] : []);

  if (envNames.length === 0) {
    return Response.json(
      { isSet: false, source: 'none', reason: 'provider_not_supported' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined;
  const hasServerSecret = envNames.some((name) => {
    const candidates = [cloudflareEnv?.[name], runtimeEnv?.[name], llmManager.env[name]];
    return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
  });

  return Response.json(
    {
      isSet: hasServerSecret,
      source: hasServerSecret ? 'environment' : 'none',
      reason: hasServerSecret ? 'server_credential_found' : 'server_credential_missing',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
