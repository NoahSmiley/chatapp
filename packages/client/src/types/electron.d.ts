interface ScreenShareSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

interface FluxAPI {
  platform: string;
  versions: {
    node: string;
    electron: string;
    chrome: string;
  };

  // Screen share picker
  onScreenShareSources: (callback: (sources: ScreenShareSource[]) => void) => () => void;
  selectScreenShareSource: (sourceId: string) => void;
  cancelScreenShare: () => void;

  // Pop-out windows
  openPopoutWindow: (type: "chat" | "screenshare") => Promise<void>;
  closePopoutWindow: (type: "chat" | "screenshare") => Promise<void>;
  onPopoutClosed: (callback: (type: string) => void) => () => void;
}

declare global {
  interface Window {
    flux?: FluxAPI;
  }
}

export {};
