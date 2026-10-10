import { createContext, useContext } from "react";

import { formatBytes } from "../utils/animeFormat";

export const MAX_BATCH = 50;

export const DownloadContext = createContext(null);

export function describeDownload(download) {
  const { status, title, total = 1, completed = 0, current, failed = [], error, filename, stage, bytes, lastError } = download;
  const name = title ? `${title}: ` : "";

  if (status === "starting") return "Starting the download…";
  if (status === "running") {
    const doing =
      stage === "finding"
        ? "finding the video (this can take a minute)"
        : stage === "saving"
          ? "saving to the library"
          : bytes > 0
            ? `downloading, ${formatBytes(bytes)} so far`
            : "connecting to the video host";
    const failedNote = failed.length
      ? ` ${failed.length} failed${lastError ? ` (${lastError.slice(0, 160)})` : ""}.`
      : "";
    return total > 1
      ? `${name}episode ${current ?? "…"}: ${doing}. ${completed} of ${total} finished.${failedNote} Keep this tab open.`
      : `${name}${doing}. This can take a few minutes.${failedNote}`;
  }
  if (status === "done") {
    const skipped = failed.length ? ` Episodes ${failed.join(", ")} failed and were left out.` : "";
    return `Saved to your Downloads library and sent to your browser: ${filename}.${skipped}`;
  }
  if (status === "error") return `Download failed. ${error}`;
  return "";
}

export function downloadProgress(download) {
  if (download.status === "done") return 1;
  const total = download.overall?.total ?? download.total ?? 0;
  const completed = download.overall?.completed ?? download.completed ?? 0;
  return total > 1 ? Math.min(1, completed / total) : null;
}

export function shortDownloadLabel(download) {
  const { status, stage } = download;
  const total = download.overall?.total ?? download.total ?? 0;
  const completed = download.overall?.completed ?? download.completed ?? 0;

  if (status === "starting") return "Starting…";
  if (status === "running") {
    if (total > 1) return `${completed} of ${total}`;
    return stage === "finding" ? "Finding video…" : stage === "saving" ? "Saving…" : "Downloading…";
  }
  if (status === "done") return "Saved";
  if (status === "error") return "Failed";
  return "";
}

export function useDownload(animeId, lang) {
  const context = useContext(DownloadContext);
  if (!context) throw new Error("useDownload needs a <DownloadProvider> above it.");

  const { download, start, startAll } = context;
  return [
    download,
    (episodes) => start(animeId, episodes, lang),
    (episodes) => startAll(animeId, episodes, lang),
  ];
}
