import { useEffect, useState } from "react";

interface ScreenShareSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

export function ScreenSharePicker() {
  const [sources, setSources] = useState<ScreenShareSource[] | null>(null);

  useEffect(() => {
    if (!window.flux?.onScreenShareSources) return;

    const cleanup = window.flux.onScreenShareSources((newSources) => {
      setSources(newSources);
    });

    return cleanup;
  }, []);

  if (!sources) return null;

  const handleSelect = (sourceId: string) => {
    window.flux?.selectScreenShareSource(sourceId);
    setSources(null);
  };

  const handleCancel = () => {
    window.flux?.cancelScreenShare();
    setSources(null);
  };

  return (
    <div className="screen-share-picker" onClick={handleCancel}>
      <div className="screen-share-picker-content" onClick={(e) => e.stopPropagation()}>
        <div className="screen-share-picker-header">
          <h3>Choose what to share</h3>
          <button className="btn-small" onClick={handleCancel}>Cancel</button>
        </div>
        <div className="screen-share-grid">
          {sources.map((source) => (
            <button
              key={source.id}
              className="screen-share-source"
              onClick={() => handleSelect(source.id)}
            >
              <img
                src={source.thumbnail}
                alt={source.name}
                className="screen-share-thumbnail"
              />
              <div className="screen-share-source-info">
                {source.appIcon && (
                  <img src={source.appIcon} alt="" className="screen-share-app-icon" />
                )}
                <span className="screen-share-source-name">{source.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
