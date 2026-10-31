import test from 'node:test';
import assert from 'node:assert/strict';

const event = (listeners = []) => ({
  addListener(listener) {
    listeners.push(listener);
  }
});

test('registers the anonymous uninstall survey URL and recreates only the Search menu', async () => {
  const calls = [];
  const actionListeners = [];
  const panelBehaviorCalls = [];
  const installListeners = [];
  const menuCalls = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: event(installListeners),
      onStartup: event(),
      onMessage: event(),
      setUninstallURL(url) {
        calls.push(url);
      }
    },
    contextMenus: {
      onClicked: event(),
      removeAll: () => {
        menuCalls.push('removeAll');
        return Promise.resolve();
      },
      create: (menu) => menuCalls.push(menu)
    },
    sidePanel: {
      setPanelBehavior: (behavior) => {
        panelBehaviorCalls.push(behavior);
        return Promise.resolve();
      },
      open: () => Promise.resolve()
    },
    storage: {
      sync: { get: async () => ({}) },
      local: { get: async () => ({}), set: async () => {} },
      session: { set: async () => {} },
      onChanged: event()
    },
    alarms: {
      create: async () => {},
      onAlarm: event()
    },
    notifications: {
      create: async () => {},
      clear: async () => {},
      onClicked: event()
    },
    action: {
      onClicked: event(actionListeners),
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    }
  };

  try {
    await import(`../background.js?uninstall-survey=${Date.now()}`);
    installListeners[0]();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    delete globalThis.chrome;
    delete globalThis.browser;
  }

  assert.deepEqual(panelBehaviorCalls, [{ openPanelOnActionClick: true }]);
  assert.deepEqual(menuCalls, [
    'removeAll',
    { id: 'zureq-search', title: 'Search Zureq for “%s”', contexts: ['selection'] }
  ]);
  assert.equal(actionListeners.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0],
    'https://docs.google.com/forms/d/e/1FAIpQLSc-ox6juSdwAYQGTsliCwK_tv3jRuGi0JhqiE2SEHtCfZUZCw/viewform'
  );
  assert.match(calls[0], /^https:\/\/docs\.google\.com\/forms\//);
  assert.equal(calls[0].includes('?'), false);
});

test('opens the Firefox sidebar synchronously for action and context-menu requests', async () => {
  const actionListeners = [];
  const menuListeners = [];
  const sequence = [];
  let pending;
  let resolveSession;
  globalThis.browser = {
    sidebarAction: {
      open() {
        sequence.push('open');
        return Promise.resolve();
      },
      toggle() {
        sequence.push('toggle');
      }
    }
  };
  globalThis.chrome = {
    runtime: {
      onInstalled: event(),
      onStartup: event(),
      onMessage: event(),
      setUninstallURL() {}
    },
    contextMenus: {
      onClicked: event(menuListeners),
      removeAll: () => Promise.resolve(),
      create() {}
    },
    storage: {
      sync: { get: async () => ({}) },
      local: { get: async () => ({}), set: async () => {} },
      session: {
        set(value) {
          sequence.push('session.set');
          pending = value.zureqPending;
          return new Promise((resolve) => { resolveSession = resolve; });
        }
      },
      onChanged: event()
    },
    alarms: {
      create: async () => {},
      onAlarm: event()
    },
    notifications: {
      create: async () => {},
      clear: async () => {},
      onClicked: event()
    },
    action: {
      onClicked: event(actionListeners),
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    }
  };

  try {
    await import(`../background.js?firefox-sidebar=${Date.now()}`);
    assert.equal(actionListeners.length, 1);
    actionListeners[0]();
    assert.equal(sequence[0], 'toggle');

    const menuPromise = menuListeners[0](
      { menuItemId: 'zureq-search', selectionText: '  headphones  ' },
      { id: 42 }
    );
    assert.deepEqual(sequence.slice(1), ['open', 'session.set']);
    assert.equal(pending.query, 'headphones');
    assert.equal(pending.tabId, 42);
    assert.equal(pending.mode, 'search');
    assert.equal(Number.isFinite(pending.createdAt), true);
    resolveSession();
    await menuPromise;
  } finally {
    resolveSession?.();
    delete globalThis.chrome;
    delete globalThis.browser;
  }
});
