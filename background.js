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
