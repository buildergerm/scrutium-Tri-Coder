import type { LoaderFunction } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { LLMManager } from '~/lib/modules/llm/manager';

const ENV_KEY_ALIASES: Record<string, string[]> = {
  GOOGLE_GENERATIVE_AI_API_KEY: ['GEMINI_API_KEY'],
  OPEN_ROUTER_API_KEY: ['OPENROUTER_API_KEY'],
};

export const loader: LoaderFunction = async ({ context, request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return Response.json({ isSet: false });
  }

  const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
  const providerInstance = llmManager.getProvider(provider);

  if (!providerInstance || !providerInstance.config.apiTokenKey) {
    return Response.json({ isSet: false });
  }

  const envVarName = providerInstance.config.apiTokenKey;

  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);

  /*
   * Check API key in order of precedence:
   * 1. Client-side API keys (from cookies)
   * 2. Server environment variables (from Cloudflare env)
   * 3. Process environment variables (from .env.local)
   * 4. LLMManager environment variables
   */
  const envNames = [envVarName, ...(ENV_KEY_ALIASES[envVarName] || [])];
  const cloudflareEnv = context?.cloudflare?.env as Record<string, unknown> | undefined;
  const hasServerSecret = envNames.some((name) => {
    const value = cloudflareEnv?.[name] ?? process.env[name] ?? llmManager.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
  const isSet = hasServerSecret || Boolean(apiKeys?.[provider]?.trim());

  return Response.json({ isSet, source: hasServerSecret ? 'environment' : isSet ? 'user' : 'none' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
};
