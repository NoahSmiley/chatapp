import { app, BrowserWindow, desktopCapturer, session, ipcMain } from "electron";
import path from "path";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

// Pending screen share callback from setDisplayMediaRequestHandler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pendingScreenShareCallback: ((result: any) => void) | null = null;

// Pop-out windows
const popoutWindows = new Map<string, BrowserWindow>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    title: "Flux",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0e0e0e",
      symbolColor: "#e8e8e8",
      height: 36,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Screen sharing: show picker instead of auto-granting
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deny = () => (callback as any)(null);
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
      });

      if (sources.length === 0) {
        deny();
        return;
      }

      const sourceList = sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon?.toDataURL() ?? null,
      }));

      pendingScreenShareCallback = callback as any;
      mainWindow?.webContents.send("screen-share-sources", sourceList);
    } catch {
      deny();
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// Screen share picker IPC
ipcMain.on("screen-share-select", (_event, sourceId: string) => {
  if (!pendingScreenShareCallback) return;
  const cb = pendingScreenShareCallback;
  pendingScreenShareCallback = null;

  desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
    const selected = sources.find((s) => s.id === sourceId);
    if (selected) {
      cb({ video: selected });
    } else {
      cb(null);
    }
  });
});

ipcMain.on("screen-share-cancel", () => {
  if (pendingScreenShareCallback) {
    pendingScreenShareCallback(null);
    pendingScreenShareCallback = null;
  }
});

// Titlebar color IPC
ipcMain.on("set-titlebar-color", (_event, color: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setTitleBarOverlay({
        color,
        symbolColor: "#e8e8e8",
        height: 36,
      });
    } catch { /* not supported on all platforms */ }
  }
});

// Pop-out window IPC
ipcMain.handle("open-popout-window", (_event, type: "chat" | "screenshare") => {
  if (popoutWindows.has(type)) {
    popoutWindows.get(type)!.focus();
    return;
  }

  const baseUrl = isDev ? "http://localhost:5173" : `file://${path.join(__dirname, "../renderer/index.html")}`;
  const url = `${baseUrl}?popout=${type}`;

  const popout = new BrowserWindow({
    width: type === "chat" ? 500 : 960,
    height: type === "chat" ? 700 : 600,
    minWidth: 400,
    minHeight: 300,
    title: type === "chat" ? "Flux - Chat" : "Flux - Screen Share",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0e0e0e",
      symbolColor: "#e8e8e8",
      height: 36,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    parent: mainWindow ?? undefined,
  });

  popout.loadURL(url);

  popout.on("closed", () => {
    popoutWindows.delete(type);
    mainWindow?.webContents.send("popout-closed", type);
  });

  popoutWindows.set(type, popout);
});

ipcMain.handle("close-popout-window", (_event, type: "chat" | "screenshare") => {
  const win = popoutWindows.get(type);
  if (win) {
    win.close();
    popoutWindows.delete(type);
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
