import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld("flux", {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  // Screen share picker
  onScreenShareSources: (callback: (sources: Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sources: Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>) => {
      callback(sources);
    };
    ipcRenderer.on("screen-share-sources", handler);
    return () => {
      ipcRenderer.removeListener("screen-share-sources", handler);
    };
  },
  selectScreenShareSource: (sourceId: string) => {
    ipcRenderer.send("screen-share-select", sourceId);
  },
  cancelScreenShare: () => {
    ipcRenderer.send("screen-share-cancel");
  },

  // Titlebar
  setTitleBarOverlayColor: (color: string) => {
    ipcRenderer.send("set-titlebar-color", color);
  },

  // Pop-out windows
  openPopoutWindow: (type: "chat" | "screenshare") => {
    return ipcRenderer.invoke("open-popout-window", type);
  },
  closePopoutWindow: (type: "chat" | "screenshare") => {
    return ipcRenderer.invoke("close-popout-window", type);
  },
  onPopoutClosed: (callback: (type: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, type: string) => {
      callback(type);
    };
    ipcRenderer.on("popout-closed", handler);
    return () => {
      ipcRenderer.removeListener("popout-closed", handler);
    };
  },
});
