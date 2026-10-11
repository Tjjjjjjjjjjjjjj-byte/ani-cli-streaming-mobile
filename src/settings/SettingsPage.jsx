import { useEffect, useState } from "react";
import { STANDALONE } from "../api";
import { useLibrary } from "../library/useLibrary";
import { deleteDownloads, findWatchedDownloads } from "../library/cleanup";
import StorageMeter from "../library/StorageMeter";
import { usePlayerPrefs } from "../watch/useEpisode";
import { useSettings } from "../store/settings";
import { statsStore, formatDuration, summarize } from "../store/stats";
import { useStore } from "../store/storage";
import { clearRecentSearches } from "../store/searchStore";
import { clearAllPersonalData, clearHistoryData, clearStatsData, exportPersonalData } from "../store/clearData";
import { formatBytes } from "../utils/animeFormat";
import { Row, Section, Segmented, Switch } from "./controls";

const SUB_SIZES = [["small", "S"], ["medium", "M"], ["large", "L"], ["xlarge", "XL"]];
const SUB_BACKGROUNDS = [[0, "None"], [0.4, "Soft"], [0.75, "Solid"]];

function SubtitlePreview({ settings }) {
  return (
    <div className="sub-preview" aria-hidden="true">
      <div
        className={`player__subs player__subs--${settings.subSize} player__subs--${settings.subPos}`}
        style={{ "--sub-bg": `rgba(0, 0, 0, ${settings.subBg})` }}
      >
        <p>This is how subtitles will look.</p>
      </div>
    </div>
  );
}

function Stats() {
  const stats = useStore(statsStore);
  const s = summarize(stats);
  const peak = Math.max(1, ...s.week.map((d) => d.sec));
  const empty = s.totalSec === 0 && s.totalEps === 0;

  if (empty) {
    return <p className="settings__empty">Nothing to show yet. Watch an episode and your numbers appear here.</p>;
  }

  return (
    <>
      <div className="stats__cards">
        <div className="stats__card">
          <strong>{formatDuration(s.totalSec)}</strong>
          <span>Watched in total</span>
        </div>
        <div className="stats__card">
          <strong>{s.totalEps}</strong>
          <span>Episodes finished</span>
        </div>
        <div className="stats__card">
          <strong>{s.streak}</strong>
          <span>Day streak</span>
        </div>
        <div className="stats__card">
          <strong>{formatDuration(s.weekSec)}</strong>
          <span>This week</span>
        </div>
      </div>

      <div className="stats__chart" role="img" aria-label={`Watch time over the last 7 days: ${formatDuration(s.weekSec)} in total`}>
        {s.week.map((d) => (
          <div className="stats__day" key={d.key}>
            <span className="stats__value">{d.sec > 0 ? formatDuration(d.sec) : ""}</span>
            <span className="stats__col">
              <span style={{ height: `${Math.max(d.sec > 0 ? 6 : 0, (d.sec / peak) * 100)}%` }} />
            </span>
            <span className="stats__label">{d.label}</span>
          </div>
        ))}
      </div>

      <div className="stats__lists">
        {s.shows.length > 0 && (
          <div>
            <h3>Most watched</h3>
            <ol>
              {s.shows.map((show) => (
                <li key={show.key}>
                  <span title={show.title}>{show.title}</span>
                  <em>{formatDuration(show.sec)}</em>
                </li>
              ))}
            </ol>
          </div>
        )}
        {s.genres.length > 0 && (
          <div>
            <h3>Top genres</h3>
            <ol>
              {s.genres.map((genre) => (
                <li key={genre.key}>
                  <span>{genre.key}</span>
                  <em>{formatDuration(genre.sec)}</em>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {s.since && <p className="settings__hint">Counting since {s.since}. All of this stays on this device.</p>}
    </>
  );
}

function SettingsPage() {
  const [settings, update] = useSettings();
  const [playerPrefs, togglePlayerPref] = usePlayerPrefs();
  const [library, reloadLibrary] = useLibrary();
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    document.title = "Settings";
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, []);

  function toggleAdult(next) {
    if (next && !window.confirm("Show adult (18+) titles in search, home and details? Only turn this on if you are 18 or older.")) return;
    update({ allowAdult: next });
    setMessage({ ok: true, text: next ? "Adult titles are now included. Reload the home page to refresh it." : "Adult titles are hidden again." });
  }

  async function freeUpSpace() {
    setBusy(true);
    setMessage(null);
    try {
      const watched = await findWatchedDownloads();
      if (watched.length === 0) {
        setMessage({ ok: true, text: "No downloaded episodes that you've already watched." });
        return;
      }
      const bytes = watched.reduce((n, e) => n + e.size, 0);
      if (!window.confirm(`Delete ${watched.length} watched episode${watched.length === 1 ? "" : "s"} and free about ${formatBytes(bytes)}?`)) return;
      const result = await deleteDownloads(watched);
      setMessage({ ok: true, text: `Deleted ${result.deleted} episode${result.deleted === 1 ? "" : "s"} and freed ${formatBytes(result.bytes)}.` });
      reloadLibrary();
    } catch (err) {
      setMessage({ ok: false, text: `Couldn't clean up: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  function downloadMyData() {
    const blob = new Blob([JSON.stringify(exportPersonalData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ani-cli-streaming-data.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wipeEverything() {
    clearAllPersonalData();
    window.location.assign("/");
  }

  return (
    <main className="settings">
      <header className="settings__header">
        <h1>Settings</h1>
        <p>Everything here is stored on this device only.</p>
      </header>

      {message && (
        <p className={`settings__message${message.ok ? "" : " is-error"}`} role="status">
          {message.text}
        </p>
      )}

      <Section icon="play_circle" title="Playback" hint="How the player behaves.">
        <Row label="Auto play" hint="Start playing as soon as an episode loads.">
          <Switch label="Auto play" checked={playerPrefs.autoPlay} onChange={() => togglePlayerPref("autoPlay")} />
        </Row>
        <Row label="Auto next" hint="Count down to the next episode when one ends.">
          <Switch label="Auto next" checked={playerPrefs.autoNext} onChange={() => togglePlayerPref("autoNext")} />
        </Row>
        <Row label="Next episode countdown" hint="Seconds before the next episode starts by itself.">
          <Segmented label="Countdown" value={settings.countdownSeconds} options={[[3, "3s"], [5, "5s"], [10, "10s"]]} onChange={(v) => update({ countdownSeconds: v })} />
        </Row>
        <Row label="Auto skip" hint="Skip openings and endings when skip times are known.">
          <Switch label="Auto skip" checked={playerPrefs.autoSkip} onChange={() => togglePlayerPref("autoSkip")} />
        </Row>
        <Row label="Touch gestures" hint="Hold to play at 2x. In fullscreen, swipe up/down on the left for brightness and on the right for volume.">
          <Switch label="Touch gestures" checked={settings.gestures} onChange={(v) => update({ gestures: v })} />
        </Row>
        <Row label="Haptic feedback" hint="A short vibration on double-tap seek and hold-to-speed (Android).">
          <Switch label="Haptic feedback" checked={settings.haptics} onChange={(v) => update({ haptics: v })} />
        </Row>
      </Section>

      <Section icon="closed_caption" title="Subtitles" hint="Size is also remembered separately for each show.">
        <Row label="Show subtitles">
          <Switch label="Show subtitles" checked={settings.subEnabled} onChange={(v) => update({ subEnabled: v })} />
        </Row>
        <Row label="Default size" hint="Used until you pick a size for a show in the player.">
          <Segmented label="Subtitle size" value={settings.subSize} options={SUB_SIZES} onChange={(v) => update({ subSize: v })} />
        </Row>
        <Row label="Background">
          <Segmented label="Subtitle background" value={settings.subBg} options={SUB_BACKGROUNDS} onChange={(v) => update({ subBg: v })} />
        </Row>
        <Row label="Position">
          <Segmented label="Subtitle position" value={settings.subPos} options={[["low", "Low"], ["high", "High"]]} onChange={(v) => update({ subPos: v })} />
        </Row>
        <SubtitlePreview settings={settings} />
      </Section>

      <Section icon="download_for_offline" title="Downloads and storage">
        <StorageMeter items={library.items} />
        {!STANDALONE && (
          <>
            <Row label="Auto-download the next episodes" hint="After you finish an episode, quietly download the ones after it.">
              <Segmented
                label="Auto-download count"
                value={settings.autoDownloadNext}
                options={[[0, "Off"], [1, "1"], [2, "2"], [3, "3"], [5, "5"]]}
                onChange={(v) => update({ autoDownloadNext: v })}
              />
            </Row>
            <Row label="Only on Wi-Fi" hint="Skips auto-downloads on mobile data or Data Saver. Some browsers can't tell, and then it allows them.">
              <Switch label="Only on Wi-Fi" checked={settings.wifiOnly} onChange={(v) => update({ wifiOnly: v })} />
            </Row>
            <Row label="Delete after watching" hint="Remove a downloaded episode from the library once you've watched most of it.">
              <Switch label="Delete after watching" checked={settings.deleteAfterWatching} onChange={(v) => update({ deleteAfterWatching: v })} />
            </Row>
            <Row label="Also save a zip to this device" hint="When a download finishes, your browser gets a copy as a zip file.">
              <Switch label="Save zip" checked={settings.saveZipToDevice} onChange={(v) => update({ saveZipToDevice: v })} />
            </Row>
            <Row label="Free up space" hint="Deletes downloaded episodes you've already watched.">
              <button type="button" className="btn btn--outline" disabled={busy} onClick={freeUpSpace}>
                {busy ? "Checking…" : "Clean up watched"}
              </button>
            </Row>
          </>
        )}
      </Section>

      <Section icon="search" title="Search">
        <Row label="Search as you type" hint="Show results after you pause typing, without pressing Enter.">
          <Switch label="Search as you type" checked={settings.searchAsYouType} onChange={(v) => update({ searchAsYouType: v })} />
        </Row>
        <Row label="Remember recent searches" hint="Shown under the search box. Saved filter presets are kept separately.">
          <Switch
            label="Remember recent searches"
            checked={settings.saveSearches}
            onChange={(v) => {
              update({ saveSearches: v });
              if (!v) clearRecentSearches();
            }}
          />
        </Row>
      </Section>

      <Section icon="shield" title="Content">
        <Row label="Allow adult content" hint="Include 18+ titles in home, search and details. Off by default.">
          <Switch label="Allow adult content" checked={settings.allowAdult} onChange={toggleAdult} />
        </Row>
      </Section>

      <Section icon="monitoring" title="Your stats" hint="Calculated on this device from what you watch. Never uploaded.">
        <Row label="Collect viewing stats" hint="Turn off to stop counting. Existing numbers stay until you reset them.">
          <Switch label="Collect viewing stats" checked={settings.collectStats} onChange={(v) => update({ collectStats: v })} />
        </Row>
        <Stats />
        <Row label="Reset stats">
          <button type="button" className="btn btn--outline" onClick={() => window.confirm("Reset all viewing stats?") && clearStatsData()}>
            Reset
          </button>
        </Row>
      </Section>

      <Section icon="lock" title="Privacy and data">
        <Row label="Save watch history" hint="Powers Continue watching and resuming inside an episode.">
          <Switch label="Save watch history" checked={settings.saveHistory} onChange={(v) => update({ saveHistory: v })} />
        </Row>
        <Row label="Clear watch history" hint="Removes Continue watching, resume spots and watched checkmarks.">
          <button type="button" className="btn btn--outline" onClick={() => window.confirm("Clear your watch history?") && (clearHistoryData(), setMessage({ ok: true, text: "Watch history cleared." }))}>
            Clear history
          </button>
        </Row>
        <Row label="Download my data" hint="Everything this app remembers about you, as a JSON file.">
          <button type="button" className="btn btn--outline" onClick={downloadMyData}>
            Download
          </button>
        </Row>

        <div className="settings__danger">
          <h3>Clear all personal data</h3>
          <p>
            Erases your history, resume spots, watched marks, watchlist, stats, per-show choices and all of these settings from this device.
            Downloaded episodes are not touched.
          </p>
          {!wiping ? (
            <button type="button" className="btn btn--danger" onClick={() => setWiping(true)}>
              Clear all personal data…
            </button>
          ) : (
            <div className="settings__confirm">
              <label>
                Type <strong>DELETE</strong> to confirm
                <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" autoComplete="off" />
              </label>
              <div className="settings__confirm-actions">
                <button type="button" className="btn btn--danger" disabled={confirmText.trim().toUpperCase() !== "DELETE"} onClick={wipeEverything}>
                  Erase everything
                </button>
                <button type="button" className="btn btn--outline" onClick={() => { setWiping(false); setConfirmText(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>
    </main>
  );
}

export default SettingsPage;
