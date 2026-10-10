// Makes the app installable and shows a "server is starting" page when the
// Termux servers are down. Needs https or localhost.
export function registerApp() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
