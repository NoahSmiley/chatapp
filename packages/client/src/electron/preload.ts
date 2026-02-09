import { contextBridge } from "electron";

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld("flux", {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
