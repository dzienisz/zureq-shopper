import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../assistant.js';

test('parses search country and price', () => {
  assert.deepEqual(parseIntent('find a mechanical keyboard in Poland under 200 PLN'), {
    type: 'search', query: 'a mechanical keyboard', country: 'PL', maxPrice: 200
  });
});

test('parses compare markets', () => {
  assert.deepEqual(parseIntent('compare DJI Mini 4 in PL and DE'), {
    type: 'compare', query: 'DJI Mini 4', markets: ['PL', 'DE']
  });
});

test('parses build handoff', () => {
  assert.deepEqual(parseIntent('I want to build an FPV drone'), { type: 'build', text: 'an FPV drone' });
});

test('parses usage and markets questions', () => {
  assert.equal(parseIntent('How many credits left?').type, 'usage');
  assert.equal(parseIntent('Which countries do you support?').type, 'markets');
});
