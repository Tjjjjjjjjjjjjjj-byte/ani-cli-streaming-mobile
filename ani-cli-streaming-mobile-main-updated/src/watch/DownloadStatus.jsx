import ProgressRing from "./ProgressRing";
import { describeDownload, downloadProgress, shortDownloadLabel } from "./useDownload";

function DownloadStatus({ download, size = 34, className = "" }) {
  if (download.status === "idle") return null;

  const { status } = download;
  const progress = downloadProgress(download);
  const percent = progress == null ? null : Math.round(progress * 100);
  const tone = status === "error" ? "error" : status === "done" ? "done" : "default";
  const full = describeDownload(download);

  return (
    <div className={`dl-status dl-status--${tone} ${className}`} role="status" title={full}>
      <ProgressRing value={status === "error" ? 1 : progress} size={size} stroke={size > 28 ? 3.5 : 3} tone={tone}>
        {status === "done" && <span className="material-symbols-outlined">check</span>}
        {status === "error" && <span className="material-symbols-outlined">priority_high</span>}
        {status === "running" && percent != null && size > 28 && <span className="dl-status__pct">{percent}</span>}
      </ProgressRing>

      <span className="dl-status__text">
        <span className="dl-status__label">{shortDownloadLabel(download)}</span>
        {status === "done" && download.fileUrl && (
          <a className="dl-status__link" href={download.fileUrl}>
            Save again
          </a>
        )}
        {status === "error" && download.error && <span className="dl-status__error">{download.error}</span>}
        {status === "done" && download.failed?.length > 0 && (
          <span className="dl-status__error">Episodes {download.failed.join(", ")} failed.</span>
        )}
      </span>
      <span className="visually-hidden">{full}</span>
    </div>
  );
}

export default DownloadStatus;
