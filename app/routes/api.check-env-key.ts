import type { LoaderFunction } from 'react-router';
import { LLMManager } from '~/lib/modules/llm/manager';

// Keep the public provider names and their server credential bindings explicit.
// This check must not depend on provider registration order or browser cookies.
const PROVIDER_API_TOKEN_KEYS: Record<string, string[]> = {
  OpenRouter: ['OPEN_ROUTER_API_KEY', 'OPENROUTER_API_KEY'],
  Google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
};

export const loader: LoaderFunction = async ({ context, request }) => {
  const url = new URL(request.url);
  const providerName = url.searchParams.get('provider');

  if (!providerName) {
    return Response.json(
      { isSet: false, source: 'none', reason: 'provider_required' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cloudflareEnv = context?.cloudflare?.env as unknown as Record<string, unknown> | undefined;
  const llmManager = LLMManager.getInstance(cloudflareEnv as Record<string, string> | undefined);
  const provider = llmManager.getProvider(providerName);
  const configuredKeys =
    PROVIDER_API_TOKEN_KEYS[providerName] ??
    (provider?.config.apiTokenKey
      ? [provider.config.apiTokenKey]
      : []);

  if (configuredKeys.length === 0) {
    return Response.json(
      { isSet: false, source: 'none', reason: 'provider_not_supported' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined;
  const hasServerSecret = configuredKeys.some((name) => {
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
