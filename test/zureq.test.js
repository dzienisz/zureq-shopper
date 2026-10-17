import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSearchHistory, callTool, locationArgs, mapApiError, normalizeMarkets,
  parseToolResponse, ZureqError
} from '../zureq.js';

test('maps country codes and regions to search location arguments', () => {
  assert.deepEqual(locationArgs(''), {});
  assert.deepEqual(locationArgs('EU'), { region: 'EU' });
  assert.deepEqual(locationArgs('eu'), { region: 'EU' });
  assert.deepEqual(locationArgs('pl'), { country: 'PL' });
});

test('prefers API-provided market labels', () => {
  assert.deepEqual(
    normalizeMarkets({ countries: [
      { country: 'PL', name: 'Poland API name', label: 'Poland API label', shops: 2648 },
      { country: 'DE', label: 'Germany API label', shops: 42 }
    ] }),
    [
      { code: 'PL', label: 'Poland API name', count: 2648 },
      { code: 'DE', label: 'Germany API label', count: 42 }
    ]
  );
});

test('maps known API errors to friendly codes and messages', () => {
  const error = mapApiError({ code: -32003, message: 'credits' });
  assert.equal(error.code, 'CREDITS_EXHAUSTED');
  assert.match(error.message, /credits/i);
  assert(error instanceof ZureqError);
});

test('maps invalid arguments', () => {
  assert.equal(mapApiError({ code: -32602 }).code, 'INVALID_ARGS');
});

test('parses structured content', () => {
  const data = { products: [{ name: 'Lamp' }] };
  assert.deepEqual(parseToolResponse({ result: { structuredContent: data } }), data);
});

test('parses JSON text fallback', () => {
  assert.deepEqual(parseToolResponse({ result: { content: [{ type: 'text', text: '{"count":2}' }] } }), { count: 2 });
});

test('returns non-JSON text fallback', () => {
  assert.equal(parseToolResponse({ result: { content: [{ type: 'text', text: 'done' }] } }), 'done');
});

test('calls the MCP endpoint with a key from fake Chrome storage', async () => {
  globalThis.chrome = { storage: { sync: { get: async () => ({ zureqApiKey: 'test-key' }) } } };
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { json: async () => ({ result: { structuredContent: { remaining: 4 } } }) };
  };
  assert.deepEqual(await callTool('get_usage', {}), { remaining: 4 });
  assert.equal(request.params.name, 'get_usage');
  assert.equal(request.params.arguments.constructor, Object);
  delete globalThis.chrome;
  delete globalThis.fetch;
});

test('surfaces error responses returned as tool text', () => {
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: '{"error":"timed out"}' }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'timed out'
  );
});

test('surfaces object-valued API error messages', () => {
  const text = '{"error":{"message":"invalid market","code":-32602}}';
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'invalid market'
  );
  const missingMessage = '{"error":{"code":-32602}}';
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: missingMessage }] } }),
    (error) => error.code === 'API_ERROR' && error.message === missingMessage
  );
});

test('surfaces non-JSON error responses returned as tool text', () => {
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: 'Service unavailable' }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'Service unavailable'
  );
});

test('persists the newest search history rather than the old array', async () => {
  let saved;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ zureqHistory: ['old search', 'another search'] }),
        set: async (values) => { saved = values; }
      }
    }
  };
  assert.deepEqual(await addSearchHistory('new search'), ['new search', 'old search', 'another search']);
  assert.deepEqual(saved, { zureqHistory: ['new search', 'old search', 'another search'] });
  delete globalThis.chrome;
});
