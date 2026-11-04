import { describe, expect, it } from 'vitest';
import { getApiTokenEnvKeys, getServerApiToken } from './api-token-env';

describe('API token environment aliases', () => {
  it('checks the canonical OpenRouter name and its legacy alias', () => {
    expect(getApiTokenEnvKeys('OPEN_ROUTER_API_KEY')).toEqual(['OPEN_ROUTER_API_KEY', 'OPENROUTER_API_KEY']);
  });

  it('reads a non-empty server binding without exposing it through a status shape', () => {
    expect(getServerApiToken('OPEN_ROUTER_API_KEY', { OPENROUTER_API_KEY: 'server-secret' })).toBe('server-secret');
    expect(getServerApiToken('OPEN_ROUTER_API_KEY', { OPEN_ROUTER_API_KEY: '   ' })).toBeUndefined();
  });
});
