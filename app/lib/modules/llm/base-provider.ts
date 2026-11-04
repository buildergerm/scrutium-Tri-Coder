import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getEnv } from './env';
import type { ProviderInfo, ProviderConfig, ModelInfo } from './types';
import type { IProviderSetting } from '~/types/model';

/** Default timeout for model listing API calls (5 seconds) */
const MODEL_FETCH_TIMEOUT = 5_000;

/**
 * Cloudflare secret names used by deployed Scrutium Workers. Keep provider
 * package defaults as fallbacks so local development and browser-key users
 * remain compatible.
 */
const API_TOKEN_ENV_ALIASES: Record<string, string[]> = {
  GOOGLE_GENERATIVE_AI_API_KEY: ['GEMINI_API_KEY'],
  OPEN_ROUTER_API_KEY: ['OPENROUTER_API_KEY'],
};

export abstract class BaseProvider implements ProviderInfo {
  abstract name: string;
  abstract staticModels: ModelInfo[];
  abstract config: ProviderConfig;
  cachedDynamicModels?: {
    cacheId: string;
    models: ModelInfo[];
  };

  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;

  /**
   * Convert Cloudflare Env bindings to a plain Record<string, string>.
   * Useful because provider methods expect Record<string, string> but
   * Cloudflare Workers pass an Env interface.
   */
  protected convertEnvToRecord(env?: Env): Record<string, string> {
    if (!env) {
      return {};
    }

    return Object.entries(env).reduce(
      (acc, [key, value]) => {
        acc[key] = String(value);

        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Rewrite localhost / 127.0.0.1 URLs to host.docker.internal when
   * running inside Docker. Only applies on the server side.
   */
  protected resolveDockerUrl(baseUrl: string, serverEnv?: Record<string, string>): string {
    const isDocker = process?.env?.RUNNING_IN_DOCKER === 'true' || serverEnv?.RUNNING_IN_DOCKER === 'true';

    if (!isDocker) {
      return baseUrl;
    }

    return baseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  }

  /**
   * Create an AbortSignal that times out after the given milliseconds.
   * Used to prevent model-listing fetches from hanging indefinitely.
   */
  protected createTimeoutSignal(ms: number = MODEL_FETCH_TIMEOUT): AbortSignal {
    return AbortSignal.timeout(ms);
  }

  getProviderBaseUrlAndKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: IProviderSetting;
    serverEnv?: Record<string, string>;
    defaultBaseUrlKey: string;
    defaultApiTokenKey: string;
  }) {
    const { apiKeys, providerSettings, serverEnv, defaultBaseUrlKey, defaultApiTokenKey } = options;

    let settingsBaseUrl = providerSettings?.baseUrl;

    const managerEnv = getEnv();

    if (settingsBaseUrl && settingsBaseUrl.length == 0) {
      settingsBaseUrl = undefined;
    }

    const baseUrlKey = this.config.baseUrlKey || defaultBaseUrlKey;

    let baseUrl =
      settingsBaseUrl ||
      serverEnv?.[baseUrlKey] ||
      process?.env?.[baseUrlKey] ||
      managerEnv?.[baseUrlKey] ||
      this.config.baseUrl;

    if (baseUrl && baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const apiTokenKey = this.config.apiTokenKey || defaultApiTokenKey;

    const apiTokenKeys = [apiTokenKey, ...(API_TOKEN_ENV_ALIASES[apiTokenKey] || [])].filter(Boolean);
    const serverApiKey = apiTokenKeys.map((key) => serverEnv?.[key]).find((value) => Boolean(value?.trim()));
    const processApiKey = apiTokenKeys.map((key) => process?.env?.[key]).find((value) => Boolean(value?.trim()));
    const managerApiKey = apiTokenKeys.map((key) => managerEnv?.[key]).find((value) => Boolean(value?.trim()));

    // Worker secrets are server-owned credentials and must win over any
    // browser-supplied key. Browser keys remain a fallback for non-Cloudflare
    // deployments and users who have not configured a Worker secret.
    const apiKey = serverApiKey || processApiKey || managerApiKey || apiKeys?.[this.name];

    return {
      baseUrl,
      apiKey,
    };
  }
  getModelsFromCache(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): ModelInfo[] | null {
    if (!this.cachedDynamicModels) {
      return null;
    }

    const cacheKey = this.cachedDynamicModels.cacheId;
    const generatedCacheKey = this.getDynamicModelsCacheKey(options);

    if (cacheKey !== generatedCacheKey) {
      this.cachedDynamicModels = undefined;

      return null;
    }

    return this.cachedDynamicModels.models;
  }
  getDynamicModelsCacheKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    // Only include provider-relevant env keys, not the entire server environment
    const configuredTokenKey = this.config.apiTokenKey;
    const relevantEnvKeys = [
      this.config.baseUrlKey,
      configuredTokenKey,
      ...(configuredTokenKey ? API_TOKEN_ENV_ALIASES[configuredTokenKey] || [] : []),
    ].filter(Boolean) as string[];
    const relevantEnv: Record<string, string> = {};

    for (const key of relevantEnvKeys) {
      if (options.serverEnv?.[key]) {
        relevantEnv[key] = options.serverEnv[key];
      }
    }

    return JSON.stringify({
      apiKeys: options.apiKeys?.[this.name],
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: relevantEnv,
    });
  }
  storeDynamicModels(
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
    models: ModelInfo[],
  ) {
    const cacheId = this.getDynamicModelsCacheKey(options);

    this.cachedDynamicModels = {
      cacheId,
      models,
    };
  }

  // Declare the optional getDynamicModels method
  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;

  abstract getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModel;
}

type OptionalApiKey = string | undefined;

export function getOpenAILikeModel(baseURL: string, apiKey: OptionalApiKey, model: string) {
  const openai = createOpenAI({
    baseURL,
    apiKey,
  });

  return openai.chat(model);
}
