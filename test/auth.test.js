import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connect, disconnect, getAccessToken, getClientId, isConnected, pkceChallenge, refreshAccessToken,
  ZUREQ_CLIENT_ID, ZUREQ_REDIRECT_URIS
} from '../auth.js';
import { callTool } from '../zureq.js';

const originalChrome = globalThis.chrome;
const originalFetch = globalThis.fetch;

function storageArea(store) {
  return {
    async get(defaults = {}) {
      if (typeof defaults === 'string') return { [defaults]: store[defaults] };
      return { ...defaults, ...store };
    },
    async set(values) { Object.assign(store, values); },
    async remove(key) {
      for (const item of Array.isArray(key) ? key : [key]) delete store[item];
    }
  };
}

function setup({ redirectUri = 'https://extension.chromiumapp.org/' } = {}) {
  const localStore = {};
  const syncStore = {};
  const chrome = {
    storage: {
      local: storageArea(localStore),
      sync: storageArea(syncStore)
    },
    identity: {
      getRedirectURL: () => redirectUri,
      launchWebAuthFlow: async ({ url }) => {
        const state = new URL(url).searchParams.get('state');
        return `${redirectUri}?code=auth-code&state=${encodeURIComponent(state)}`;
      }
    }
  };
  globalThis.chrome = chrome;
  return { chrome, localStore, syncStore };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function tokenResponse(access = 'access-new', refresh = 'refresh-new') {
  return { access_token: access, refresh_token: refresh, expires_in: 3600 };
}

test('pkceChallenge matches the RFC 7636 S256 vector', async () => {
  assert.equal(
    await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );
});

test('connect registers, opens the authorize URL, exchanges PKCE code, and stores tokens locally', async () => {
  const { chrome, localStore, syncStore } = setup();
  let registration;
  let authorize;
  let exchange;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/oauth/register')) {
      registration = JSON.parse(options.body);
      return response({ client_id: 'dynamic-client' });
    }
    exchange = new URLSearchParams(options.body);
    return response(tokenResponse());
  };
  chrome.identity.launchWebAuthFlow = async ({ url, interactive }) => {
    authorize = new URL(url);
    assert.equal(interactive, true);
    return `${authorize.searchParams.get('redirect_uri')}?code=auth-code&state=${authorize.searchParams.get('state')}`;
  };

  await connect();

  assert.deepEqual(registration, {
    client_name: 'ZUREQ Shopper',
    redirect_uris: ['https://extension.chromiumapp.org/'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'mcp'
  });
  assert.equal(authorize.origin, 'https://chat.zureq.io');
  assert.equal(authorize.pathname, '/oauth/authorize');
  assert.equal(authorize.searchParams.get('response_type'), 'code');
  assert.equal(authorize.searchParams.get('client_id'), 'dynamic-client');
  assert.equal(authorize.searchParams.get('redirect_uri'), 'https://extension.chromiumapp.org/');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorize.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]+$/);
  assert.equal(authorize.searchParams.get('scope'), 'mcp');
  assert.equal(authorize.searchParams.get('resource'), 'https://api.zureq.io/mcp');
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('client_id'), 'dynamic-client');
  assert.equal(exchange.get('code'), 'auth-code');
  assert.equal(exchange.get('redirect_uri'), 'https://extension.chromiumapp.org/');
  assert.equal(await pkceChallenge(exchange.get('code_verifier')), authorize.searchParams.get('code_challenge'));
  assert.equal(exchange.get('resource'), 'https://api.zureq.io/mcp');
  assert.equal(localStore.zureqAuth.access, 'access-new');
  assert.equal(localStore.zureqAuth.refresh, 'refresh-new');
  assert.equal(localStore.zureqAuth.clientId, 'dynamic-client');
  assert.equal(Object.hasOwn(syncStore, 'zureqAuth'), false);
  assert.equal(Object.hasOwn(syncStore, 'zureqOAuthClient'), false);
});

test('connect rejects a state mismatch without exchanging the code', async () => {
  const { chrome } = setup();
  let tokenRequests = 0;
  globalThis.fetch = async (url) => url.endsWith('/register')
    ? response({ client_id: 'dynamic-client' })
    : (tokenRequests += 1, response(tokenResponse()));
  chrome.identity.launchWebAuthFlow = async ({ url }) => {
    const authorize = new URL(url);
    return `${authorize.searchParams.get('redirect_uri')}?code=auth-code&state=wrong`;
  };

  await assert.rejects(connect(), (error) => error.code === 'AUTH_FAILED');
  assert.equal(tokenRequests, 0);
});

test('connect maps access_denied to a cancelled sign-in', async () => {
  const { chrome } = setup();
  globalThis.fetch = async () => response({ client_id: 'dynamic-client' });
  chrome.identity.launchWebAuthFlow = async ({ url }) => {
    const authorize = new URL(url);
    return `${authorize.searchParams.get('redirect_uri')}?error=access_denied&state=${authorize.searchParams.get('state')}`;
  };

  await assert.rejects(connect(), (error) => error.code === 'AUTH_DENIED' && error.message === 'Sign-in was cancelled.');
});

test('connect maps other authorization errors to AUTH_FAILED', async () => {
  const { chrome } = setup();
  globalThis.fetch = async () => response({ client_id: 'dynamic-client' });
  chrome.identity.launchWebAuthFlow = async ({ url }) => {
    const authorize = new URL(url);
    return `${authorize.searchParams.get('redirect_uri')}?error=server_error&state=${authorize.searchParams.get('state')}`;
  };

  await assert.rejects(connect(), (error) => error.code === 'AUTH_FAILED');
});

test('connect maps a closed sign-in window to AUTH_DENIED', async () => {
  const { chrome } = setup();
  globalThis.fetch = async () => response({ client_id: 'dynamic-client' });
  chrome.identity.launchWebAuthFlow = async () => { throw new Error('user closed the window'); };

  await assert.rejects(connect(), (error) => error.code === 'AUTH_DENIED');
});

test('getClientId uses the fixed client for registered store redirects without registering', async () => {
  const { chrome, localStore } = setup();
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('unexpected registration request');
  };

  for (const redirectUri of ZUREQ_REDIRECT_URIS) {
    chrome.identity.getRedirectURL = () => redirectUri;
    assert.equal(await getClientId(), ZUREQ_CLIENT_ID);
  }

  assert.equal(requests, 0);
  assert.equal(Object.hasOwn(localStore, 'zureqOAuthClient'), false);
});

test('getClientId falls back to dynamic registration for unknown redirects', async () => {
  const redirectUri = 'https://dev-extension.chromiumapp.org/';
  const { localStore } = setup({ redirectUri });
  let registration;
  globalThis.fetch = async (_url, options) => {
    registration = JSON.parse(options.body);
    return response({ client_id: 'dynamic-client' });
  };

  assert.equal(await getClientId(), 'dynamic-client');
  assert.deepEqual(registration.redirect_uris, [redirectUri]);
  assert.equal(localStore.zureqOAuthClient.redirectUri, redirectUri);
});

test('dynamic client registration is cached by redirect URI when the fixed client is disabled', async () => {
  const { chrome, localStore } = setup();
  let registrations = 0;
  globalThis.fetch = async (_url, options) => {
    registrations += 1;
    assert.equal(JSON.parse(options.body).client_name, 'ZUREQ Shopper');
    return response({ client_id: `dynamic-${registrations}` });
  };

  assert.equal(await getClientId(''), 'dynamic-1');
  assert.equal(await getClientId(''), 'dynamic-1');
  assert.equal(registrations, 1);
  chrome.identity.getRedirectURL = () => 'https://another-extension.chromiumapp.org/';
  assert.equal(await getClientId(''), 'dynamic-2');
  assert.equal(localStore.zureqOAuthClient.redirectUri, 'https://another-extension.chromiumapp.org/');
  assert.equal(await getClientId(''), 'dynamic-2');
  assert.equal(registrations, 2);
});

test('simultaneous expired-token reads share one refresh and store the rotated refresh token', async () => {
  const { localStore } = setup();
  localStore.zureqAuth = {
    access: 'expired-access',
    refresh: 'single-use-refresh',
    expiresAt: Date.now() - 1,
    clientId: 'registered-client'
  };
  let refreshRequests = 0;
  globalThis.fetch = async (_url, options) => {
    refreshRequests += 1;
    assert.equal(new URLSearchParams(options.body).get('refresh_token'), 'single-use-refresh');
    await new Promise((resolve) => setTimeout(resolve, 10));
    return response(tokenResponse('rotated-access', 'rotated-refresh'));
  };

  const access = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

  assert.deepEqual(access, ['rotated-access', 'rotated-access', 'rotated-access']);
  assert.equal(refreshRequests, 1);
  assert.equal(localStore.zureqAuth.refresh, 'rotated-refresh');
  assert.equal(await isConnected(), true);
});

test('refreshAccessToken returns a fresh token already stored by another context', async () => {
  const { localStore } = setup();
  localStore.zureqAuth = {
    access: 'new-access',
    refresh: 'new-refresh',
    expiresAt: Date.now() + 3600000,
    clientId: 'registered-client'
  };
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return response(tokenResponse()); };

  assert.equal(await refreshAccessToken('stale-access'), 'new-access');
  assert.equal(requests, 0);
});

test('invalid_grant clears local OAuth state and asks the user to connect again', async () => {
  const { localStore } = setup();
  localStore.zureqAuth = {
    access: 'expired-access',
    refresh: 'invalid-refresh',
    expiresAt: Date.now() - 1,
    clientId: 'registered-client'
  };
  globalThis.fetch = async () => response({ error: 'invalid_grant' }, 400);

  await assert.rejects(getAccessToken(), (error) => (
    error.code === 'NO_KEY'
    && error.message === 'Your ZUREQ sign-in has ended. Connect again to continue.'
  ));
  assert.equal(Object.hasOwn(localStore, 'zureqAuth'), false);
});

test('callTool prefers OAuth over a saved API key and refreshes once after HTTP 401', async () => {
  const { localStore, syncStore } = setup();
  localStore.zureqAuth = {
    access: 'expired-access',
    refresh: 'single-use-refresh',
    expiresAt: Date.now() + 3600000,
    clientId: 'registered-client'
  };
  syncStore.zureqApiKey = 'saved-api-key';
  const authorization = [];
  const requestBodies = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/oauth/token')) return response(tokenResponse('fresh-access', 'fresh-refresh'));
    authorization.push(options.headers.Authorization);
    requestBodies.push(options.body);
    return authorization.length === 1
      ? response({ error: 'invalid_token' }, 401)
      : response({ result: { structuredContent: { remaining: 10 } } });
  };

  assert.deepEqual(await callTool('get_usage', {}, { retryRateLimit: false }), { remaining: 10 });
  assert.deepEqual(authorization, ['Bearer expired-access', 'Bearer fresh-access']);
  assert.equal(requestBodies[0], requestBodies[1]);
  assert.equal(localStore.zureqAuth.refresh, 'fresh-refresh');
});

test('callTool clears OAuth state and throws NO_KEY after a second HTTP 401', async () => {
  const { localStore } = setup();
  localStore.zureqAuth = {
    access: 'expired-access',
    refresh: 'single-use-refresh',
    expiresAt: Date.now() + 3600000,
    clientId: 'registered-client'
  };
  globalThis.fetch = async (url) => url.endsWith('/api/oauth/token')
    ? response(tokenResponse('fresh-access', 'fresh-refresh'))
    : response({ error: 'invalid_token' }, 401);

  await assert.rejects(callTool('get_usage', {}), (error) => (
    error.code === 'NO_KEY'
    && error.message === 'Your ZUREQ sign-in has ended. Connect again to continue.'
  ));
  assert.equal(Object.hasOwn(localStore, 'zureqAuth'), false);
});

test('callTool uses a saved API key when not connected and explicit key override wins', async () => {
  const { syncStore } = setup();
  syncStore.zureqApiKey = 'saved-api-key';
  const authorization = [];
  globalThis.fetch = async (_url, options) => {
    authorization.push(options.headers.Authorization);
    return response({ result: { structuredContent: { remaining: 1 } } });
  };

  await callTool('get_usage', {});
  await callTool('get_usage', {}, { apiKey: 'typed-api-key' });

  assert.deepEqual(authorization, ['Bearer saved-api-key', 'Bearer typed-api-key']);
});

test('callTool preserves API-key BAD_KEY handling on HTTP 401', async () => {
  const { syncStore } = setup();
  syncStore.zureqApiKey = 'saved-api-key';
  globalThis.fetch = async () => response({ error: { code: -32001 } }, 401);

  await assert.rejects(callTool('get_usage', {}), (error) => error.code === 'BAD_KEY');
});

test('callTool reports the connect-or-key message when no credential exists', async () => {
  setup();
  globalThis.fetch = async () => { throw new Error('unexpected request'); };

  await assert.rejects(callTool('get_usage', {}), (error) => (
    error.code === 'NO_KEY'
    && error.message === 'Connect with ZUREQ or add an API key in Options to get started.'
  ));
});

test('disconnect revokes the refresh token and clears local state when revoke fails', async () => {
  const { localStore, syncStore } = setup();
  localStore.zureqAuth = {
    access: 'access',
    refresh: 'refresh-to-revoke',
    expiresAt: Date.now() + 3600000,
    clientId: 'registered-client'
  };
  syncStore.zureqApiKey = 'saved-api-key';
  let revokeRequest;
  globalThis.fetch = async (_url, options) => {
    revokeRequest = new URLSearchParams(options.body);
    throw new Error('revoke unavailable');
  };

  await disconnect();

  assert.equal(revokeRequest.get('token'), 'refresh-to-revoke');
  assert.equal(revokeRequest.get('client_id'), 'registered-client');
  assert.equal(Object.hasOwn(localStore, 'zureqAuth'), false);
  assert.equal(syncStore.zureqApiKey, 'saved-api-key');
});

test.afterEach(() => {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
});
