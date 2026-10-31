function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function skeletonHtml(kind, count) {
  const requested = Number(count);
  const itemCount = Math.max(1, Math.min(6, Number.isFinite(requested) ? Math.floor(requested) : 3));

  if (kind === 'product') {
    return Array.from({ length: itemCount }, () => `
      <article class="card skeleton" aria-hidden="true">
        <div class="skeleton-image"></div>
        <div class="skeleton-copy">
          <span class="skeleton-bar skeleton-title"></span>
          <span class="skeleton-bar skeleton-shop"></span>
          <span class="skeleton-bar skeleton-price"></span>
        </div>
      </article>`).join('');
  }

  throw new TypeError(`Unsupported skeleton kind: ${kind}`);
}

export function setBusy(button, busy, label) {
  if (!button) return;

  if (busy) {
    if (button.dataset.idleLabel === undefined) button.dataset.idleLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
    return;
  }

  if (button.dataset.idleLabel !== undefined) {
    button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('is-loading');
}
