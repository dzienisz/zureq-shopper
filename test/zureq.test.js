import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, mapApiError, parseToolResponse, ZureqError } from '../zureq.js';

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
    (error) => error.code === 'API_ERROR' && /timed out/.test(error.message)
  );
});
