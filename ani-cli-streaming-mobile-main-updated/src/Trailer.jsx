import { useCallback, useEffect, useRef, useState } from "react";

const isYouTube = (trailer) => trailer?.site?.toLowerCase() === "youtube";

const PLAYING = 1;
const ENDED = 0;
const START_DELAY_MS = 1800;
const SKIP_SECONDS = 10;
const HIDE_CONTROLS_MS = 2600;

function embedUrl(trailer, mode) {
  const id = encodeURIComponent(trailer.id);
  if (!isYouTube(trailer)) return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    enablejsapi: "1",
    origin: window.location.origin,
  });
  if (mode === "background") params.set("mute", "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

function send(frame, func, args = "") {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function listen(frame) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
}

function readMessage(e, frame) {
  if (e.source !== frame?.contentWindow) return null;
  try {
    return typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  } catch {
    return null;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Icon({ name }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontVariationSettings: '"FILL" 1' }}>
      {name}
    </span>
  );
}

export function TrailerBackground({ trailer, onStateChange }) {
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState("idle");
  const [muted, setMuted] = useState(true);

  const allowed =
    isYouTube(trailer) &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !navigator.connection?.saveData;

  useEffect(() => {
    if (!allowed) return;
    const timer = setTimeout(() => setArmed(true), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  useEffect(() => () => onStateChange?.("idle"), [onStateChange]);

  useEffect(() => {
    if (!armed) return;
    function onMessage(e) {
      const data = readMessage(e, frameRef.current);
      if (!data) return;
      const code = data.event === "onStateChange" ? data.info : data.info?.playerState;
      if (code === PLAYING) setState("playing");
      else if (code === ENDED) setState("ended");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [armed]);

  useEffect(() => {
    if (state !== "playing") return;
    let visible = true;
    const sync = () => send(frameRef.current, visible && !document.hidden ? "playVideo" : "pauseVideo");
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(wrapRef.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [state]);

  const toggleSound = useCallback(() => {
    send(frameRef.current, muted ? "unMute" : "mute");
    setMuted((m) => !m);
  }, [muted]);

  function replay() {
    setState("idle");
    send(frameRef.current, "seekTo", [0, true]);
    send(frameRef.current, "playVideo");
  }

  if (!allowed) return null;

  return (
    <>
      <div ref={wrapRef} className={`trailer-bg${state === "playing" ? " is-playing" : ""}`} aria-hidden="true">
        {armed && (
          <iframe
            ref={frameRef}
            className="trailer-bg__frame"
            title="Trailer preview"
            src={embedUrl(trailer, "background")}
            allow="autoplay; encrypted-media; picture-in-picture"
            tabIndex={-1}
            onLoad={() => listen(frameRef.current)}
          />
        )}
      </div>

      {state === "playing" && (
        <button type="button" className="trailer-sound" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? "Unmute preview" : "Mute preview"}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {muted ? "volume_off" : "volume_up"}
          </span>
        </button>
      )}
      {state === "ended" && (
        <button type="button" className="trailer-sound" onClick={replay} aria-label="Replay preview">
          <span className="material-symbols-outlined" aria-hidden="true">replay</span>
        </button>
      )}
    </>
  );
}

function YouTubePlayer({ trailer, title }) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const hideTimer = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    function onMessage(e) {
      const data = readMessage(e, frameRef.current);
      if (!data) return;
      if (data.event === "onStateChange") {
        setPlaying(data.info === PLAYING);
        if (data.info === PLAYING) setStarted(true);
        return;
      }
      const info = data.info;
      if (data.event !== "infoDelivery" || !info || typeof info !== "object") return;
      if (info.playerState !== undefined) {
        setPlaying(info.playerState === PLAYING);
        if (info.playerState === PLAYING) setStarted(true);
      }
      if (typeof info.currentTime === "number") setTime(info.currentTime);
      if (typeof info.duration === "number" && info.duration > 0) setDuration(info.duration);
      if (typeof info.muted === "boolean") setMuted(info.muted);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const onChange = () => {
      const active = (document.fullscreenElement ?? document.webkitFullscreenElement) === wrapRef.current;
      setFullscreen(active);
      if (!active) screen.orientation?.unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      screen.orientation?.unlock?.();
    };
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const wake = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_MS);
  }, []);

  function togglePlay() {
    send(frameRef.current, playing ? "pauseVideo" : "playVideo");
    setPlaying(!playing);
    wake();
  }

  function seekTo(seconds) {
    const next = Math.max(0, Math.min(duration || seconds, seconds));
    send(frameRef.current, "seekTo", [next, true]);
    setTime(next);
    wake();
  }

  function toggleMute() {
    send(frameRef.current, muted ? "unMute" : "mute");
    setMuted(!muted);
    wake();
  }

  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    try {
      if (document.fullscreenElement ?? document.webkitFullscreenElement) {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      } else if (wrap.requestFullscreen) {
        await wrap.requestFullscreen({ navigationUI: "hide" });
        if (window.matchMedia("(pointer: coarse)").matches) {
          await screen.orientation?.lock?.("landscape").catch(() => {});
        }
      } else if (wrap.webkitRequestFullscreen) {
        wrap.webkitRequestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen failed:", err);
    }
  }

  function handleSurface() {
    if (window.matchMedia("(pointer: coarse), (max-width: 700px)").matches) {
      if (controlsVisible && playing) {
        clearTimeout(hideTimer.current);
        setControlsVisible(false);
      } else wake();
      return;
    }
    togglePlay();
  }

  function handleKeyDown(e) {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") seekTo(time - SKIP_SECONDS);
    else if (e.key === "ArrowRight") seekTo(time + SKIP_SECONDS);
    else if (e.key === "m") toggleMute();
    else if (e.key === "f") toggleFullscreen();
  }

  const show = controlsVisible || !playing;
  const played = duration ? (time / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`player trailer-player${show ? "" : " is-idle"}${fullscreen ? " is-fullscreen" : ""}`}
      onMouseMove={wake}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <iframe
        ref={frameRef}
        className="trailer-player__frame"
        title={`${title} trailer`}
        src={embedUrl(trailer, "full")}
        allow="autoplay; encrypted-media; picture-in-picture"
        tabIndex={-1}
        onLoad={() => {
          listen(frameRef.current);
          wake();
        }}
      />
      <div className="trailer-player__surface" onClick={handleSurface} />

      {!playing && (
        <button type="button" className="player__big-play" aria-label={started ? "Resume" : "Play"} onClick={togglePlay}>
          <Icon name="play_arrow" />
        </button>
      )}

      <div className="player__controls">
        <input
          className="player__seek"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(time, duration || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Seek"
          aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
          style={{ "--played": `${played}%`, "--buffered": "0%" }}
        />
        <div className="player__row">
          <div className="player__group">
            <button type="button" className="player__btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              <Icon name={playing ? "pause" : "play_arrow"} />
            </button>
            <button type="button" className="player__btn" onClick={() => seekTo(time - SKIP_SECONDS)} aria-label={`Back ${SKIP_SECONDS} seconds`}>
              <Icon name="fast_rewind" />
            </button>
            <button type="button" className="player__btn" onClick={() => seekTo(time + SKIP_SECONDS)} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
              <Icon name="fast_forward" />
            </button>
            <span className="player__time">
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>
          <div className="player__group">
            <button type="button" className="player__btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              <Icon name={muted ? "volume_off" : "volume_up"} />
            </button>
            <button type="button" className="player__btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              <Icon name={fullscreen ? "fullscreen_exit" : "fullscreen"} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrailerPlayer({ trailer, title }) {
  if (isYouTube(trailer)) return <YouTubePlayer trailer={trailer} title={title} />;
  return (
    <div className="player trailer-player">
      <iframe
        className="trailer-player__frame trailer-player__frame--plain"
        title={`${title} trailer`}
        src={embedUrl(trailer, "full")}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
