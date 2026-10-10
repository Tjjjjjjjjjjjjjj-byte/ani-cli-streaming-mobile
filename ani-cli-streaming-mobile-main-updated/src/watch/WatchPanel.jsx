import Player from "../player";
import { usePlayerPrefs } from "./useEpisode";
import { downloadProgress } from "./useDownload";
import DownloadStatus from "./DownloadStatus";
import ProgressRing from "./ProgressRing";
import { formatAired } from "../utils/animeFormat";

function WatchPanel({
  watch,
  lang,
  totalEpisodes,
  onSelectEpisode,
  onSelectLang,
  download,
  onDownload,
  onRetry,
  expanded,
  onToggleExpand,
  skipTimes = [],
  onWatched,
  detail = null,
  infoLoading = false,
  startAt = 0,
  initialSpeed = 1,
  onSpeedChange,
  subSize = null,
  onSubSize,
  onProgress,
}) {
  const [prefs, togglePref] = usePlayerPrefs();
  const downloadBusy = download.status === "starting" || download.status === "running";

  const episode = watch.episode;
  const loading = watch.status === "loading";
  const canPrev = episode > 1;
  const canNext = totalEpisodes == null || episode < totalEpisodes;
  const aired = formatAired(detail?.aired);

  return (
    <section className="watch" aria-live="polite">
      <div className="watch__stage">
        {loading && (
          <div className="watch__placeholder">
            <span className="watch__spinner" aria-hidden="true" />
            <p>Finding episode {episode}… this can take up to a minute.</p>
          </div>
        )}

        {watch.status === "error" && (
          <div className="watch__placeholder">
            <p>Couldn’t load episode {episode}. {watch.error}</p>
            <div className="watch__placeholder-actions">
              <button className="btn btn--outline" type="button" onClick={onRetry}>
                Try again
              </button>
              {lang === "dub" && (
                <button className="btn btn--outline" type="button" onClick={() => onSelectLang("sub")}>
                  Watch subbed instead
                </button>
              )}
            </div>
          </div>
        )}

        {watch.status === "ready" && (
          <Player
            key={watch.url}
            src={watch.url}
            subtitles={watch.subtitles}
            skipTimes={skipTimes}
            autoSkip={prefs.autoSkip}
            autoPlay={prefs.autoPlay}
            onWatched={onWatched}
            startAt={startAt}
            initialSpeed={initialSpeed}
            onSpeedChange={onSpeedChange}
            subSize={subSize}
            onSubSize={onSubSize}
            onProgress={onProgress}
            nextEpisode={canNext ? episode + 1 : null}
            onNext={() => onSelectEpisode(episode + 1)}
            autoNext={prefs.autoNext}
          />
        )}
      </div>

      <div className="watch__toolbar">
        <div className="watch__toggles">
          <button type="button" className="toggle" onClick={onToggleExpand} aria-pressed={expanded}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {expanded ? "close_fullscreen" : "open_in_full"}
            </span>
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button type="button" className="toggle" onClick={() => togglePref("autoPlay")} aria-pressed={prefs.autoPlay}>
            Auto Play <span className={`toggle__state${prefs.autoPlay ? " is-on" : ""}`}>{prefs.autoPlay ? "On" : "Off"}</span>
          </button>
          <button type="button" className="toggle" onClick={() => togglePref("autoNext")} aria-pressed={prefs.autoNext}>
            Auto Next <span className={`toggle__state${prefs.autoNext ? " is-on" : ""}`}>{prefs.autoNext ? "On" : "Off"}</span>
          </button>
          <button type="button" className="toggle" onClick={() => togglePref("autoSkip")} aria-pressed={prefs.autoSkip}>
            Auto Skip <span className={`toggle__state${prefs.autoSkip ? " is-on" : ""}`}>{prefs.autoSkip ? "On" : "Off"}</span>
          </button>
        </div>

        <div className="watch__toggles">
          <button
            type="button"
            className="toggle"
            disabled={loading}
            onClick={() => onDownload([episode])}
          >
            {downloadBusy ? (
              <ProgressRing size={18} stroke={2.5} value={downloadProgress(download)} />
            ) : (
              <span className="material-symbols-outlined" aria-hidden="true">download</span>
            )}
            {downloadBusy ? "Downloading…" : "Download"}
          </button>
          <button type="button" className="toggle" disabled={!canPrev || loading} onClick={() => onSelectEpisode(episode - 1)}>
            <span className="material-symbols-outlined" aria-hidden="true">fast_rewind</span>
            Prev
          </button>
          <button type="button" className="toggle" disabled={!canNext || loading} onClick={() => onSelectEpisode(episode + 1)}>
            Next
            <span className="material-symbols-outlined" aria-hidden="true">fast_forward</span>
          </button>
        </div>
      </div>

      <div className="watch__info">
        <div className="watch__now">
          <p>You are watching</p>
          <p className="watch__now-episode">Episode {episode}{totalEpisodes != null ? ` of ${totalEpisodes}` : ""}</p>
          <p className="watch__now-hint">If the video doesn’t load, reload the page or try the episode again.</p>
        </div>
        <div className="watch__tracks">
          {["sub", "dub"].map((option) => (
            <div className="watch__track-row" key={option}>
              <span className="watch__track-label">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {option === "sub" ? "closed_caption" : "mic"}
                </span>
                {option === "sub" ? "SUB:" : "DUB:"}
              </span>
              <button
                type="button"
                className={`watch__pill${lang === option ? " is-active" : ""}`}
                aria-pressed={lang === option}
                disabled={loading}
                onClick={() => lang !== option && onSelectLang(option)}
              >
                HD
              </button>
            </div>
          ))}

          <DownloadStatus download={download} size={32} className="watch__download" />
        </div>

        <div className="watch__episode" key={episode}>
          <div className="watch__episode-head">
            <p className="watch__episode-title">{detail?.title ?? `Episode ${episode}`}</p>
            {(aired || detail?.filler || detail?.recap) && (
              <p className="watch__episode-meta">
                {aired}
                {detail?.filler && <span className="ep-tag ep-tag--filler">Filler</span>}
                {detail?.recap && <span className="ep-tag">Recap</span>}
              </p>
            )}
          </div>

          {infoLoading ? (
            <div className="watch__episode-skeleton" role="status" aria-label="Loading the episode description">
              <span className="sk sk--line" />
              <span className="sk sk--line" />
              <span className="sk sk--line sk--w60" />
            </div>
          ) : detail?.synopsis ? (
            <p className="watch__episode-text scroll-text">{detail.synopsis}</p>
          ) : (
            <p className="watch__episode-text watch__episode-text--empty">
              No description is available for this episode yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default WatchPanel;
