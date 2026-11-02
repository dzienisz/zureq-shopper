import { ZureqError } from './zureq.js';

export const ZUREQ_CLIENT_ID = '';

const AUTH_URL = 'https://chat.zureq.io';
const RESOURCE = 'https://api.zureq.io/mcp';
const REGISTER_URL = `${AUTH_URL}/api/oauth/register`;
const TOKEN_URL = `${AUTH_URL}/api/oauth/token`;
const REVOKE_URL = `${AUTH_URL}/api/oauth/revoke`;
const SIGN_IN_ENDED = 'Your ZUREQ sign-in has ended. Connect again to continue.';
let refreshPromise = null;

function localStorage() {
  return globalThis.chrome?.storage?.local || null;
}

async function readAuth() {
  const storage = localStorage();
  if (!storage) return null;
  const { zureqAuth = null } = await storage.get({ zureqAuth: null });
  return zureqAuth;
}

async function removeAuth() {
  await localStorage()?.remove('zureqAuth');
}

function noKeyError() {
  return new ZureqError('NO_KEY', SIGN_IN_ENDED);
}

function authFailed() {
  return new ZureqError('AUTH_FAILED', 'Could not complete sign-in with ZUREQ. Please try again.');
}

function authDenied() {
  return new ZureqError('AUTH_DENIED', 'Sign-in was cancelled.');
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomValue(length) {
  return base64Url(globalThis.crypto.getRandomValues(new Uint8Array(length)));
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function storeTokens(tokens, clientId) {
  if (!tokens?.access_token || !tokens?.refresh_token || !Number.isFinite(Number(tokens.expires_in))) {
    throw authFailed();
  }
  await localStorage().set({
    zureqAuth: {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expiresAt: Date.now() + Number(tokens.expires_in) * 1000,
      clientId
    }
  });
}

async function requestTokens(clientId, fields) {
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...fields })
    });
  } catch {
    throw authFailed();
  }
  const body = await responseJson(response);
  if (!response.ok || !body) {
    if (body?.error === 'invalid_grant') {
      await removeAuth();
      throw noKeyError();
    }
    throw authFailed();
  }
  return body;
}

export async function pkceChallenge(verifier) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64Url(new Uint8Array(digest));
}

export async function getClientId(fixed = ZUREQ_CLIENT_ID) {
  const clientId = String(fixed || '').trim();
  if (clientId) return clientId;

  const redirectUri = globalThis.chrome.identity.getRedirectURL();
  const storage = localStorage();
  const { zureqOAuthClient = null } = await storage.get({ zureqOAuthClient: null });
  if (zureqOAuthClient?.redirectUri === redirectUri && zureqOAuthClient.clientId) {
    return zureqOAuthClient.clientId;
  }

  let response;
  try {
    response = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ZUREQ Shopper',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'mcp'
      })
    });
  } catch {
    throw authFailed();
  }
  const body = await responseJson(response);
  if (!response.ok || !body?.client_id) throw authFailed();

  await storage.set({ zureqOAuthClient: { redirectUri, clientId: body.client_id } });
  return body.client_id;
}

export async function connect() {
  const clientId = await getClientId();
  const redirectUri = globalThis.chrome.identity.getRedirectURL();
  const verifier = randomValue(32);
  const state = randomValue(16);
  const challenge = await pkceChallenge(verifier);
  const authorizeUrl = new URL(`${AUTH_URL}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'mcp',
    state,
    resource: RESOURCE
  });

  let redirect;
  try {
    redirect = await globalThis.chrome.identity.launchWebAuthFlow({
      url: authorizeUrl.href,
      interactive: true
    });
  } catch {
    throw authDenied();
  }
  if (!redirect) throw authDenied();

  let callback;
  try {
    callback = new URL(redirect);
  } catch {
    throw authFailed();
  }
  if (callback.searchParams.get('state') !== state) {
    throw new ZureqError('AUTH_FAILED', 'ZUREQ sign-in could not be verified. Please try again.');
  }
  const authError = callback.searchParams.get('error');
  if (authError === 'access_denied') throw authDenied();
  if (authError) throw authFailed();

  const code = callback.searchParams.get('code');
  if (!code) throw authFailed();
  const tokens = await requestTokens(clientId, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    resource: RESOURCE
  });
  await storeTokens(tokens, clientId);
}

export async function isConnected() {
  const auth = await readAuth();
  return Boolean(auth?.refresh);
}

export async function getAccessToken() {
  const auth = await readAuth();
  if (!auth?.refresh) {
    await removeAuth();
    throw noKeyError();
  }
  if (auth.access && Number(auth.expiresAt) > Date.now() + 60000) return auth.access;
  return refreshAccessToken(auth.access || null);
}

export function refreshAccessToken(staleAccess) {
  if (refreshPromise) return refreshPromise;
  const run = async () => {
    const auth = await readAuth();
    if (!auth?.refresh) {
      await removeAuth();
      throw noKeyError();
    }
    if (auth.access !== staleAccess && Number(auth.expiresAt) > Date.now() + 60000) {
      return auth.access;
    }

    let response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: auth.refresh,
          client_id: auth.clientId
        })
      });
    } catch {
      throw new ZureqError('AUTH_FAILED', 'Could not refresh your ZUREQ sign-in. Please try again.');
    }

    const body = await responseJson(response);
    if (body?.error === 'invalid_grant') {
      await removeAuth();
      throw noKeyError();
    }
    if (!response.ok || !body) {
      throw new ZureqError('AUTH_FAILED', 'Could not refresh your ZUREQ sign-in. Please try again.');
    }
    await storeTokens(body, auth.clientId);
    return body.access_token;
  };

  const locks = globalThis.navigator?.locks;
  const refresh = locks?.request
    ? () => locks.request('zureq-oauth-refresh', run)
    : run;
  refreshPromise = Promise.resolve().then(refresh).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function disconnect() {
  const auth = await readAuth();
  if (auth?.refresh && auth.clientId) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: auth.refresh, client_id: auth.clientId })
      });
    } catch {}
  }
  await removeAuth();
}
