import Cookies from 'js-cookie';
import React, { useState, useEffect, useCallback } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { ProviderInfo } from '~/types/model';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
}

/*
 * Cache only positive server-secret checks, and keep the lifetime short so
 * newly configured Worker secrets are detected without a browser reload.
 */
const providerEnvKeyStatusCache: Record<string, { isSet: boolean; checkedAt: number }> = {};
const ENV_STATUS_CACHE_TTL_MS = 15_000;

const apiKeyMemoizeCache: { [k: string]: Record<string, string> } = {};

export function getApiKeysFromCookies() {
  const storedApiKeys = Cookies.get('apiKeys');

  if (!storedApiKeys) {
    return {};
  }

  const cachedKeys = apiKeyMemoizeCache[storedApiKeys];

  if (cachedKeys) {
    return cachedKeys;
  }

  try {
    const parsed = JSON.parse(storedApiKeys) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const parsedKeys: Record<string, string> = {};

    for (const [providerName, key] of Object.entries(parsed)) {
      if (typeof key === 'string') {
        parsedKeys[providerName] = key;
      }
    }

    apiKeyMemoizeCache[storedApiKeys] = parsedKeys;

    return parsedKeys;
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ provider, apiKey, setApiKey }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [envKeyStatus, setEnvKeyStatus] = useState<'checking' | 'configured' | 'missing' | 'error'>('checking');
  const isEnvKeySet = envKeyStatus === 'configured';

  useEffect(() => {
    const serverManaged = providerEnvKeyStatusCache[provider.name]?.isSet === true;

    setEnvKeyStatus('checking');

    const savedKeys = getApiKeysFromCookies();
    const savedKey = serverManaged ? '' : savedKeys[provider.name] || '';
    setTempKey(savedKey);
    setApiKey(savedKey);
    setIsEditing(false);
  }, [provider.name]);

  const checkEnvApiKey = useCallback(async () => {
    const cached = providerEnvKeyStatusCache[provider.name];

    if (cached?.isSet && Date.now() - cached.checkedAt < ENV_STATUS_CACHE_TTL_MS) {
      setEnvKeyStatus('configured');
      setApiKey('');
      setTempKey('');

      return;
    }

    setEnvKeyStatus('checking');

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Environment key check failed (${response.status})`);
      }

      const data = (await response.json()) as { isSet?: boolean; source?: string };

      if (typeof data.isSet !== 'boolean') {
        throw new Error('Environment key check returned an invalid response.');
      }

      const isServerManaged = data.isSet === true && data.source === 'environment';

      if (isServerManaged) {
        providerEnvKeyStatusCache[provider.name] = { isSet: true, checkedAt: Date.now() };
        setEnvKeyStatus('configured');
        setApiKey('');
        setTempKey('');

        /*
         * Remove a stale personal key for this provider so it is not sent
         * back to the server alongside the Worker-managed credential.
         */
        const currentKeys = getApiKeysFromCookies();

        if (currentKeys[provider.name]) {
          const { [provider.name]: _staleKey, ...remainingKeys } = currentKeys;
          Cookies.set('apiKeys', JSON.stringify(remainingKeys));
        }
      } else {
        delete providerEnvKeyStatusCache[provider.name];
        setEnvKeyStatus('missing');
      }
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setEnvKeyStatus('error');
    }
  }, [provider.name, setApiKey]);

  useEffect(() => {
    checkEnvApiKey();
  }, [checkEnvApiKey]);

  const handleSave = () => {
    setApiKey(tempKey);
    const currentKeys = getApiKeysFromCookies();
    const newKeys = { ...currentKeys, [provider.name]: tempKey };
    Cookies.set('apiKeys', JSON.stringify(newKeys));
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex items-center gap-2 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} API Key:</span>
          {!isEditing && (
            <div className="flex items-center gap-2">
              {envKeyStatus === 'checking' ? (
                <span className="text-xs text-bolt-elements-textTertiary">Checking server configuration…</span>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Managed by server</span>
                </>
              ) : apiKey ? (
                <>
                  <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                  <span className="text-xs text-green-500">Set via UI</span>
                </>
              ) : envKeyStatus === 'error' ? (
                <span className="text-xs text-amber-500" title="The server credential check could not be completed.">
                  Unable to verify
                </span>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                  <span className="text-xs text-red-500">Not configured</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={tempKey}
              placeholder="Enter API Key"
              onChange={(e) => setTempKey(e.target.value)}
              className="w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                        bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                        focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
            <IconButton
              onClick={handleSave}
              title="Save API Key"
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
            >
              <div className="i-ph:check w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setIsEditing(false)}
              title="Cancel"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
            >
              <div className="i-ph:x w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <>
            {!isEnvKeySet && (
              <IconButton
                onClick={() => setIsEditing(true)}
                title="Add API Key"
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              >
                <div className="i-ph:pencil-simple w-4 h-4" />
              </IconButton>
            )}
            {provider?.getApiKeyLink && !apiKey && !isEnvKeySet && (
              <IconButton
                onClick={() => window.open(provider?.getApiKeyLink)}
                title="Get API Key"
                className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">{provider?.labelForGetApiKey || 'Get API Key'}</span>
                <div className={`${provider?.icon || 'i-ph:key'} w-4 h-4`} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};
