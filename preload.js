const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lib', {
  list: () => ipcRenderer.invoke('list'),
  launch: id => ipcRenderer.invoke('launch', id),
  rescan: () => ipcRenderer.invoke('rescan'),
  addFolder: () => ipcRenderer.invoke('add-folder'),
  remove: id => ipcRenderer.invoke('remove', id),
  edit: (id, patch) => ipcRenderer.invoke('edit', id, patch),
  setThumb: id => ipcRenderer.invoke('set-thumb', id),
  snapThumb: id => ipcRenderer.invoke('snap-thumb', id),
  openFolder: id => ipcRenderer.invoke('open-folder', id),
  onChange: fn => ipcRenderer.on('library-changed', fn),
  onRunning: fn => ipcRenderer.on('running', (_e, ids) => fn(ids)),
  setAccount: a => ipcRenderer.send('account-set', a),
  onFriends: fn => ipcRenderer.on('friends-set', (_e, list) => fn(list)),
});
