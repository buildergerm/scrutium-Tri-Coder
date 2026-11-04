import { afterEach, describe, expect, it } from 'vitest';
import { BaseProvider } from './base-provider';
import { setEnv } from './env';

class CredentialTestProvider extends BaseProvider {
  name = 'OpenRouter';
  staticModels = [];
  config = { apiTokenKey: 'OPEN_ROUTER_API_KEY' };

  getModelInstance(): any {
    throw new Error('not implemented');
  }

  resolveCredentials(options: { apiKeys?: Record<string, string>; serverEnv?: Record<string, string> }) {
    return this.getProviderBaseUrlAndKey({
      ...options,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
    });
  }
}

describe('BaseProvider server-managed credentials', () => {
  afterEach(() => setEnv({}));

  it('prefers the Cloudflare Worker secret over a browser cookie key', () => {
    const provider = new CredentialTestProvider();

    expect(
      provider.resolveCredentials({
        serverEnv: { OPEN_ROUTER_API_KEY: 'worker-secret' },
        apiKeys: { OpenRouter: 'personal-cookie-key' },
      }).apiKey,
    ).toBe('worker-secret');
  });

  it('recognizes the documented OpenRouter environment alias before browser keys', () => {
    const provider = new CredentialTestProvider();

    expect(
      provider.resolveCredentials({
        serverEnv: { OPENROUTER_API_KEY: 'worker-alias-secret' },
        apiKeys: { OpenRouter: 'personal-cookie-key' },
      }).apiKey,
    ).toBe('worker-alias-secret');
  });

  it('retains browser-key fallback for local development without a server secret', () => {
    const provider = new CredentialTestProvider();

    expect(provider.resolveCredentials({ apiKeys: { OpenRouter: 'local-cookie-key' } }).apiKey).toBe(
      'local-cookie-key',
    );
  });
});
