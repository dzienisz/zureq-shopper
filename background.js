import { callTool } from './zureq.js';
import { checkWatchlist, WATCH_ALARM, WATCH_INTERVALS } from './watchlist.js';

const menus = [
  { id: 'zureq-search', title: 'Search Zureq for “%s”' },
  { id: 'zureq-compare', title: 'Compare markets for “%s”' }
];

function createMenus() {
  chrome.contextMenus.removeAll().then(() => {
    menus.forEach((menu) => chrome.contextMenus.create({ ...menu, contexts: ['selection'] }));
  });
}

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function scheduleWatchAlarm() {
  const settings = await chrome.storage.sync.get({ watchInterval: '24' });
  const periodInMinutes = WATCH_INTERVALS[String(settings.watchInterval)] || WATCH_INTERVALS['24'];
  await chrome.alarms.create(WATCH_ALARM, { delayInMinutes: periodInMinutes, periodInMinutes });
}

function notifyWatch(watch) {
  const price = watch.lastPrice ?? '—';
  const currency = watch.lastCurrency || watch.baseline.currency || '';
  return chrome.notifications.create(`zureq-watch-${watch.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Price drop on Zureq',
    message: `${watch.name}: now ${price} ${currency} (was ${watch.baseline.price} ${watch.baseline.currency})`
  });
}

function setWatchBadge(count) {
  return Promise.all([
    chrome.action.setBadgeText({ text: count ? String(count) : '' }),
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' })
  ]);
}

async function runWatchCheck() {
  return checkWatchlist(callTool, { notify: notifyWatch, setBadge: setWatchBadge });
}

chrome.runtime.onInstalled.addListener(() => { scheduleWatchAlarm().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { scheduleWatchAlarm().catch(() => {}); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCH_ALARM) runWatchCheck().catch(() => {});
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.watchInterval) scheduleWatchAlarm().catch(() => {});
});
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId).catch(() => {});
});

function savePendingAndOpen(pending, tabId) {
  const openPanel = chrome.sidePanel.open({ tabId });
  const savePending = chrome.storage.session.set({ zureqPending: pending })
    .catch(() => chrome.storage.local.set({ zureqPending: pending }));
  return Promise.all([openPanel, savePending]);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const pending = {
    query: info.selectionText.trim(),
    tabId: tab.id,
    mode: info.menuItemId === 'zureq-compare' ? 'compare' : 'search',
    createdAt: Date.now()
  };
  await savePendingAndOpen(pending, tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'zureq-check-watchlist') {
    runWatchCheck().then(sendResponse).catch(() => sendResponse({ checked: 0, alerts: 0 }));
    return true;
  }
  if (message?.type === 'zureq-clear-badge') {
    chrome.action.setBadgeText({ text: '' });
    return false;
  }
  if (message?.type !== 'zureq-search' || !sender.tab?.id || !message.query) return false;
  const pending = {
    query: String(message.query).trim(),
    mode: 'search',
    source: message.source || null,
    tabId: sender.tab.id,
    createdAt: Date.now()
  };
  savePendingAndOpen(pending, sender.tab.id)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});
