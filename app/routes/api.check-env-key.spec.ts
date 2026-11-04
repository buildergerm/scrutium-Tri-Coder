import { describe, expect, it } from 'vitest';
import { loader } from './api.check-env-key';

describe('server-managed provider credential check', () => {
  it('does not mistake a browser cookie key for a server environment secret', async () => {
    const response = (await loader({
      request: new Request('https://example.test/api/check-env-key?provider=OpenRouter', {
        headers: { Cookie: 'apiKeys=%7B%22OpenRouter%22%3A%22personal-cookie-key%22%7D' },
      }),
      context: { cloudflare: { env: {} } },
      params: {},
    } as any)) as Response;

    await expect(response.json()).resolves.toMatchObject({ isSet: false, source: 'none' });
  });

  it('detects the canonical OpenRouter Worker secret even when a browser key is present', async () => {
    const response = (await loader({
      request: new Request('https://example.test/api/check-env-key?provider=OpenRouter', {
        headers: { Cookie: 'apiKeys=%7B%22OpenRouter%22%3A%22personal-cookie-key%22%7D' },
      }),
      context: { cloudflare: { env: { OPEN_ROUTER_API_KEY: 'worker-secret' } } },
      params: {},
    } as any)) as Response;

    await expect(response.json()).resolves.toMatchObject({
      isSet: true,
      source: 'environment',
      reason: 'server_credential_found',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('detects the OpenRouter alias used by Cloudflare deployments', async () => {
    const response = (await loader({
      request: new Request('https://example.test/api/check-env-key?provider=OpenRouter'),
      context: { cloudflare: { env: { OPENROUTER_API_KEY: 'worker-alias-secret' } } },
      params: {},
    } as any)) as Response;

    await expect(response.json()).resolves.toMatchObject({ isSet: true, source: 'environment' });
  });
});
