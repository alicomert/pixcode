const { contextBridge, ipcRenderer } = require('electron');

function normalizeNotificationPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title) return null;

  return {
    title: title.slice(0, 120),
    body: typeof payload.body === 'string' ? payload.body.slice(0, 500) : '',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 160) : undefined,
    event: typeof payload.event === 'string' ? payload.event.slice(0, 80) : undefined,
    data: payload.data && typeof payload.data === 'object' ? payload.data : undefined,
  };
}

contextBridge.exposeInMainWorld('pixcodeDesktop', {
  async notify(payload) {
    const normalized = normalizeNotificationPayload(payload);
    if (!normalized) return false;
    const result = await ipcRenderer.invoke('pixcode:desktop-notification', normalized);
    return Boolean(result?.ok);
  },
});
