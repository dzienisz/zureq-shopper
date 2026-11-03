import { ZureqError } from './zureq.js';
import { connect, isConnected } from './auth.js';

const $ = (id) => document.getElementById(id);

async function renderConnection() {
  const connected = await isConnected();
  $('connect-account').classList.toggle('hidden', connected);
  $('connect-status').textContent = connected ? 'Connected to ZUREQ.' : '';
  $('connect-status').classList.toggle('connected', connected);
  $('connect-status').classList.remove('error');
}

function showToolbarHint() {
  $('sidepanel-hint').textContent = 'Click the ZUREQ icon in the toolbar';
  $('sidepanel-hint').classList.remove('hidden');
}

$('connect-account').addEventListener('click', async () => {
  $('connect-account').disabled = true;
  try {
    await connect();
    await renderConnection();
  } catch (error) {
    $('connect-status').textContent = error instanceof ZureqError
      ? error.message
      : 'Could not sign in with ZUREQ. Please try again.';
    $('connect-status').classList.add('error');
  } finally {
    $('connect-account').disabled = false;
  }
});

$('open-side-panel').addEventListener('click', () => {
  const sidebarAction = globalThis.browser?.sidebarAction;
  if (typeof sidebarAction?.open === 'function') {
    try {
      Promise.resolve(sidebarAction.open.call(sidebarAction)).catch(showToolbarHint);
    } catch {
      showToolbarHint();
    }
    return;
  }
  const panelApi = chrome['sidePanel'];
  const windowsApi = chrome.windows;
  if (typeof panelApi?.['open'] === 'function' && typeof windowsApi?.getCurrent === 'function') {
    windowsApi.getCurrent((currentWindow) => {
      if (currentWindow?.id == null) {
        showToolbarHint();
        return;
      }
      try {
        Promise.resolve(panelApi['open']({ windowId: currentWindow.id })).catch(showToolbarHint);
      } catch {
        showToolbarHint();
      }
    });
    return;
  }
  showToolbarHint();
});

renderConnection().catch(() => {});
