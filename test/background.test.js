import test from 'node:test';
import assert from 'node:assert/strict';

const event = () => ({ addListener() {} });

test('registers the anonymous uninstall survey URL once', async () => {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: event(),
      onStartup: event(),
      onMessage: event(),
      setUninstallURL(url) {
        calls.push(url);
      }
    },
    contextMenus: {
      onClicked: event(),
      removeAll: () => Promise.resolve(),
      create() {}
    },
    sidePanel: {
      setPanelBehavior: () => Promise.resolve(),
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
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    }
  };

  try {
    await import(`../background.js?uninstall-survey=${Date.now()}`);
  } finally {
    delete globalThis.chrome;
  }

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0],
    'https://docs.google.com/forms/d/e/1FAIpQLSc-ox6juSdwAYQGTsliCwK_tv3jRuGi0JhqiE2SEHtCfZUZCw/viewform'
  );
  assert.match(calls[0], /^https:\/\/docs\.google\.com\/forms\//);
  assert.equal(calls[0].includes('?'), false);
});
