const COUNTRIES = {
  poland: 'PL', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  netherlands: 'NL', dutch: 'NL', czechia: 'CZ', 'czech republic': 'CZ',
  uk: 'GB', 'united kingdom': 'GB', britain: 'GB', usa: 'US',
  'united states': 'US', eu: 'EU'
};

function countryCode(value) {
  const clean = String(value || '').trim().toLowerCase();
  return COUNTRIES[clean] || (clean.length === 2 ? clean.toUpperCase() : null);
}

function parsePrice(text) {
  const match = String(text || '').match(/(?:under|below|less than|up to|max(?:imum)?(?: price)?|cheaper than)\s+([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]{3}|zł|€|\$|£)?/i);
  if (!match) return {};
  const maxPrice = Number(match[1].replace(',', '.'));
  return Number.isFinite(maxPrice) ? { maxPrice, currency: match[2] } : {};
}

function stripConstraint(text) {
  return String(text || '')
    .replace(/\s+(?:in|for)\s+(?:[A-Za-z ]+|[A-Z]{2})(?=\s+(?:and|,|$))/i, '')
    .replace(/\s+(?:under|below|less than|up to|max(?:imum)?(?: price)?|cheaper than)\s+[0-9]+(?:[.,][0-9]+)?\s*(?:[A-Za-z]{3}|zł|€|\$|£)?/i, '')
    .replace(/[?]+$/, '')
    .trim();
}

function parseMarkets(text) {
  const match = String(text || '').match(/\bin\s+(.+?)(?:\s+for\s+[A-Z]{3}\b|\s*$)/i);
  if (!match) return [];
  return match[1].split(/\s*(?:,|and|&)\s*/i).map(countryCode).filter(Boolean);
}

function stripArticles(text) {
  return String(text).trim().replace(/^(?:me\s+)?(?:a|an|the|some|for)\s+/i, '').trim();
}

export function parseIntent(text, _ctx = {}) {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  if (!value) return { type: 'help' };
  if (/\b(?:how many credits|credits left|credit usage|usage|quota)\b/i.test(value)) return { type: 'usage' };
  if (/\b(?:which countries|what markets|available markets|markets supported)\b/i.test(value)) return { type: 'markets' };
  if (/\b(?:help|what can you do|commands)\b/i.test(value)) return { type: 'help' };
  if (/\b(?:parts?\s+for|build|building|assemble)\b/i.test(value)) {
    const buildText = value.replace(/^(?:i\s+want\s+to\s+)?(?:build|building|assemble|parts?\s+for)\s*/i, '').trim() || value;
    return { type: 'build', text: buildText };
  }
  if (/\bcompare\b/i.test(value)) {
    const markets = parseMarkets(value);
    const query = stripArticles(value.replace(/^.*?\bcompare\s+/i, '').replace(/\s+\bin\s+.+$/i, ''));
    const currency = value.match(/\b(?:for|in)\s+([A-Z]{3})\b/)?.[1];
    return { type: 'compare', query, markets: markets.length ? markets : ['EU', 'WORLD'], ...(currency ? { currency } : {}) };
  }
  if (/\b(?:find|search|looking for|need|show me)\b/i.test(value)) {
    const prefix = value.match(/^(?:find|search|looking for|need|show me)\s+/i);
    const body = prefix ? value.slice(prefix[0].length) : value;
    const countryMatch = body.match(/\bin\s+([A-Za-z ]+?)(?=\s+(?:under|below|less than|up to)\b|$)/i);
    const country = countryCode(countryMatch?.[1]);
    const price = parsePrice(body);
    const query = stripArticles(stripConstraint(body).replace(/\s+in\s+[A-Za-z ]+$/i, ''));
    return { type: 'search', query, ...(country ? { country } : {}), ...(price.maxPrice != null ? { maxPrice: price.maxPrice } : {}) };
  }
  return { type: 'help' };
}

const INTENT_PROMPT = `Return only JSON for one intent. Schemas:
{"type":"search","query":"...","country":"PL","maxPrice":200}
{"type":"compare","query":"...","markets":["PL","DE"],"currency":"PLN"}
{"type":"build","text":"..."} | {"type":"usage"} | {"type":"markets"} | {"type":"help"}.`;

async function modelSession(systemPrompt = INTENT_PROMPT) {
  if (!globalThis.LanguageModel?.availability) return null;
  try {
    const availability = await globalThis.LanguageModel.availability();
    if (!['available', 'downloadable', 'downloading'].includes(availability)) return null;
    return await globalThis.LanguageModel.create({ systemPrompt });
  } catch {
    return null;
  }
}

export async function languageModelStatus() {
  if (!globalThis.LanguageModel?.availability) return 'off';
  try {
    const availability = await globalThis.LanguageModel.availability();
    return ['available', 'downloadable', 'downloading'].includes(availability) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function resolveIntent(text, ctx = {}) {
  const session = await modelSession();
  if (!session) return parseIntent(text, ctx);
  try {
    const result = JSON.parse(await session.prompt(`${INTENT_PROMPT}\nUser: ${text}`));
    session.destroy?.();
    return result?.type ? result : parseIntent(text, ctx);
  } catch {
    session.destroy?.();
    return parseIntent(text, ctx);
  }
}

export async function summarizeWithModel(text, result) {
  const session = await modelSession('Write one friendly, concise paragraph summarizing the supplied shopping result. Do not invent prices or products.');
  if (!session) return null;
  try {
    const summary = await session.prompt(`User request: ${text}\nResult JSON: ${JSON.stringify(result)}`);
    session.destroy?.();
    return summary;
  } catch {
    session.destroy?.();
    return null;
  }
}
