// "Is it OK to download in the background right now?"
// navigator.connection exists on Chrome for Android (what Termux users run) but not on Safari/Firefox.
// When the browser can't tell us, we assume yes instead of silently never downloading.
export function canAutoDownload(wifiOnly) {
  const c = navigator.connection;
  if (!c) return true;
  if (c.saveData) return false;
  if (!wifiOnly) return true;
  if (c.type) return c.type === "wifi" || c.type === "ethernet";
  return true;
}
