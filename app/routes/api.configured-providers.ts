import type { LoaderFunction } from 'react-router';
import { getServerApiToken } from '~/lib/modules/llm/api-token-env';
import { LLMManager } from '~/lib/modules/llm/manager';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

/** Detect server-configured credentials and local provider URLs without exposing values. */
export const loader: LoaderFunction = async ({ context }) => {
  try {
    const runtimeContext = context as typeof context & {
      env?: Record<string, unknown>;
      cloudflare?: { env?: Record<string, unknown> };
    };
    const cloudflareEnv = runtimeContext.cloudflare?.env ?? runtimeContext.env;
    const llmManager = LLMManager.getInstance(cloudflareEnv as Record<string, string> | undefined);
    const processEnv = typeof process !== 'undefined' ? process.env : undefined;
    const configuredProviders: ConfiguredProvider[] = llmManager.getAllProviders().map((provider) => {
      const apiToken = getServerApiToken(provider.config.apiTokenKey, cloudflareEnv, processEnv, llmManager.env);
      const baseUrlKey = provider.config.baseUrlKey;
      const baseUrl = baseUrlKey
        ? [cloudflareEnv?.[baseUrlKey], processEnv?.[baseUrlKey], llmManager.env[baseUrlKey]].find(
            (value) => typeof value === 'string' && value.trim().startsWith('http'),
          )
        : undefined;
      const isConfigured = Boolean(apiToken || baseUrl);

      return {
        name: provider.name,
        isConfigured,
        configMethod: isConfigured ? 'environment' : 'none',
      };
    });

    return Response.json({ providers: configuredProviders }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error detecting configured providers:', error);
    return Response.json({ providers: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
};
