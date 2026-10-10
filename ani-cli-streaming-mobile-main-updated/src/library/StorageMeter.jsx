import { useEffect, useState } from "react";
import { STANDALONE } from "../api";
import { formatBytes } from "../utils/animeFormat";

// "4.2 GB used" for the downloads library. On the standalone app the browser also tells us
// how much room the device has, so we can draw a real bar.
function StorageMeter({ items, compact = false }) {
  const used = items.reduce((sum, a) => sum + (a.size ?? 0), 0);
  const episodes = items.reduce((sum, a) => sum + (a.savedEpisodes ?? 0), 0);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    if (!STANDALONE || !navigator.storage?.estimate) return;
    navigator.storage.estimate().then((e) => e.quota && setQuota(e.quota)).catch(() => {});
  }, [used]);

  const percent = quota ? Math.min(100, (used / quota) * 100) : null;
  const text = used > 0 ? `${formatBytes(used)} used` : "Nothing downloaded yet";

  return (
    <div className={`storage${compact ? " storage--compact" : ""}`}>
      <p className="storage__text">
        <span className="material-symbols-outlined" aria-hidden="true">
          hard_drive
        </span>
        <strong>{text}</strong>
        {episodes > 0 && <span> · {episodes} episode{episodes === 1 ? "" : "s"}</span>}
        {quota && <span> · of about {formatBytes(quota)} available to the browser</span>}
      </p>
      {percent != null && (
        <div className="storage__bar" role="img" aria-label={`${Math.round(percent)}% of available storage used`}>
          <span style={{ width: `${Math.max(2, percent)}%` }} />
        </div>
      )}
    </div>
  );
}

export default StorageMeter;
