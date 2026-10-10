import { useDownloadQueue } from "../watch/useDownload";
import ProgressRing from "../watch/ProgressRing";
import { formatBytes } from "../utils/animeFormat";

const LABELS = {
  queued: "Waiting",
  starting: "Starting",
  running: "Downloading",
  paused: "Paused",
  done: "Finished",
  error: "Failed",
  canceled: "Canceled",
};

function rangeLabel(episodes) {
  if (episodes.length === 1) return `Episode ${episodes[0]}`;
  return `Episodes ${episodes[0]}–${episodes.at(-1)}`;
}

function detail(job) {
  if (job.cancelling && (job.status === "running" || job.status === "paused")) return "Canceling after this episode…";
  switch (job.status) {
    case "queued":
      return "Waiting for the current download to finish.";
    case "starting":
      return "Contacting the server…";
    case "paused":
      return "Paused. It will stop after the episode being fetched right now.";
    case "running": {
      const doing =
        job.stage === "finding"
          ? "finding the video"
          : job.stage === "saving"
            ? "saving to the library"
            : job.bytes > 0
              ? `${formatBytes(job.bytes)} so far`
              : "connecting";
      return `Episode ${job.current ?? "…"}: ${doing}`;
    }
    case "done":
      return job.failed?.length ? `Done. Episodes ${job.failed.join(", ")} failed.` : "Saved to your library.";
    case "error":
      return job.error ?? "Something went wrong.";
    default:
      return "";
  }
}

function EpisodeDots({ job }) {
  const done = new Set(job.done ?? []);
  const failed = new Set(job.failed ?? []);
  if (job.episodes.length > 24) return null;
  return (
    <ul className="queue__eps" aria-label="Episodes in this download">
      {job.episodes.map((n) => {
        const state = done.has(n) ? "done" : failed.has(n) ? "failed" : job.current === n && job.status === "running" ? "active" : "waiting";
        return (
          <li key={n} className={`queue__ep queue__ep--${state}`}>
            {state === "active" ? (
              <ProgressRing size={22} stroke={2.5} value={null} />
            ) : state === "done" ? (
              <span className="material-symbols-outlined" aria-hidden="true">check</span>
            ) : state === "failed" ? (
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            ) : null}
            <span>{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DownloadQueue() {
  const { jobs, pause, resume, cancel, clearFinished } = useDownloadQueue();
  if (jobs.length === 0) return null;

  const finished = jobs.filter((j) => ["done", "error", "canceled"].includes(j.status));

  return (
    <section className="queue" aria-label="Download queue">
      <header className="queue__head">
        <h3>Download queue</h3>
        {finished.length > 0 && (
          <button type="button" className="queue__clear" onClick={clearFinished}>
            Clear finished
          </button>
        )}
      </header>

      <ul className="queue__list">
        {jobs.map((job) => {
          const total = job.episodes.length;
          const progress = job.status === "done" ? 1 : total > 0 ? (job.completed ?? 0) / total : 0;
          const live = job.status === "running" || job.status === "paused" || job.status === "starting";
          const canStop = job.status === "queued" || live;
          return (
            <li key={job.uid} className={`queue__job queue__job--${job.status}`}>
              <div className="queue__ring">
                <ProgressRing
                  size={44}
                  stroke={4}
                  value={job.status === "starting" ? null : job.status === "error" ? 1 : progress}
                  tone={job.status === "error" ? "error" : job.status === "done" ? "done" : "default"}
                >
                  <span className="queue__count">
                    {job.completed ?? 0}/{total}
                  </span>
                </ProgressRing>
              </div>

              <div className="queue__body">
                <p className="queue__title">
                  {job.title}
                  <span className="queue__lang">{job.lang.toUpperCase()}</span>
                  {job.auto && <span className="queue__lang queue__lang--auto">Auto</span>}
                </p>
                <p className="queue__sub">
                  {rangeLabel(job.episodes)} · <span className={`queue__state queue__state--${job.status}`}>{LABELS[job.status]}</span>
                </p>
                <p className="queue__detail">{detail(job)}</p>
                <EpisodeDots job={job} />
              </div>

              {canStop && (
                <div className="queue__actions">
                  {(job.status === "running" || job.status === "paused") && !job.cancelling && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={job.status === "paused" ? `Resume ${job.title}` : `Pause ${job.title}`}
                      onClick={() => (job.status === "paused" ? resume(job.uid) : pause(job.uid))}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {job.status === "paused" ? "play_arrow" : "pause"}
                      </span>
                    </button>
                  )}
                  {!job.cancelling && (
                    <button type="button" className="icon-btn" aria-label={`Cancel ${job.title}`} onClick={() => cancel(job.uid)}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        close
                      </span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default DownloadQueue;
