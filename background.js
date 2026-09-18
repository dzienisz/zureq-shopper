import { addSearchHistory } from './zureq.js';

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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const pending = { query: info.selectionText.trim(), tabId: tab.id, mode: info.menuItemId === 'zureq-compare' ? 'compare' : 'search' };
  try {
    await chrome.storage.session.set({ zureqPending: pending });
  } catch {
    await chrome.storage.local.set({ zureqPending: pending });
  }
  await addSearchHistory(pending.query);
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return true;
});
