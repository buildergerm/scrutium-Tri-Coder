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

    await expect(response.json()).resolves.toEqual({ isSet: false, source: 'none' });
  });

  it('reports a Cloudflare Worker secret as an environment credential', async () => {
    const response = await loader({
      request: new Request('https://example.test/api/check-env-key?provider=OpenRouter', {
        headers: { Cookie: 'apiKeys=%7B%22OpenRouter%22%3A%22personal-cookie-key%22%7D' },
      }),
      context: { cloudflare: { env: { OPEN_ROUTER_API_KEY: 'worker-secret' } } },
      params: {},
    } as any)) as Response;

    await expect(response.json()).resolves.toEqual({ isSet: true, source: 'environment' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
