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
  const pending = {
    query: info.selectionText.trim(),
    tabId: tab.id,
    mode: info.menuItemId === 'zureq-compare' ? 'compare' : 'search',
    createdAt: Date.now()
  };
  const openPanel = chrome.sidePanel.open({ tabId: tab.id });
  const savePending = chrome.storage.session.set({ zureqPending: pending })
    .catch(() => chrome.storage.local.set({ zureqPending: pending }));
  await Promise.all([openPanel, savePending]);
});
