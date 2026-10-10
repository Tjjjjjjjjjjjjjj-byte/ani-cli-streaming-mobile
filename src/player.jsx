import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const SKIP_SECONDS = 10;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DOUBLE_TAP_MS = 300;
const STREAK_MS = 600;
const FLASH_MS = 700;

const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Icon({ name, filled = false }) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={filled ? { fontVariationSettings: '"FILL" 1' } : undefined}
    >
      {name}
    </span>
  );
}

function Player({ src, kind = "hls", subtitles, skipTimes = [], autoSkip = false, autoPlay = true, onEnded, onWatched }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const hideTimer = useRef(null);
  const autoSkipped = useRef(new Set());
  const watchedReported = useRef(false);
  const pointerType = useRef("mouse");
  const controlsWereVisible = useRef(true);
  const lastTap = useRef({ time: 0, side: null });
  const streak = useRef({ time: 0, side: null });
  const tapTimer = useRef(null);
  const flashTimer = useRef(null);

  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [started, setStarted] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const video = videoRef.current;

    if (kind === "file") {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setFailed(true);
      });
      return () => hls.destroy();
    }

    video.src = src;
  }, [src, kind]);

  useEffect(() => {
    const onChange = () => {
      const inFullscreen = fullscreenElement() === wrapRef.current;
      setFullscreen(inFullscreen);
      if (!inFullscreen) screen.orientation?.unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      screen.orientation?.unlock?.();
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(tapTimer.current);
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const wake = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) {
        setControlsVisible(false);
        setMenuOpen(false);
      }
    }, 2800);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  function skip(delta) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }

  const phoneLike = () =>
    pointerType.current !== "mouse" || window.matchMedia("(pointer: coarse), (max-width: 700px)").matches;

  function showFlash(side) {
    setFlash((f) => ({
      id: f?.side === side ? f.id : Date.now(),
      side,
      seconds: f?.side === side ? f.seconds + SKIP_SECONDS : SKIP_SECONDS,
    }));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }

  function handleTap(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const side = x < 0.35 ? "left" : x > 0.65 ? "right" : "center";
    const now = Date.now();
    const previous = lastTap.current;
    const continuing = side !== "center" && streak.current.side === side && now - streak.current.time < STREAK_MS;
    const doubled = previous.side === side && now - previous.time < DOUBLE_TAP_MS;
    const wereVisible = controlsWereVisible.current;

    clearTimeout(tapTimer.current);

    if (side !== "center" && (continuing || doubled)) {
      skip(side === "left" ? -SKIP_SECONDS : SKIP_SECONDS);
      showFlash(side);
      streak.current = { time: now, side };
      lastTap.current = { time: now, side };
      return;
    }

    if (side === "center" && doubled) {
      togglePlay();
      lastTap.current = { time: 0, side: null };
      wake();
      return;
    }

    streak.current = { time: 0, side: null };
    lastTap.current = { time: now, side };
    tapTimer.current = setTimeout(() => {
      if (!wereVisible || !videoRef.current || videoRef.current.paused) wake();
      else {
        clearTimeout(hideTimer.current);
        setControlsVisible(false);
        setMenuOpen(false);
      }
    }, DOUBLE_TAP_MS - 20);
  }

  const activeSegment =
    skipTimes.find((seg) => current >= seg.start && current < seg.end - 1) ?? null;

  function skipSegment(seg) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seg.end;
  }

  function handleTimeUpdate(e) {
    const time = e.currentTarget.currentTime;
    setCurrent(time);

    const total = e.currentTarget.duration;
    if (onWatched && !watchedReported.current && total > 0 && time / total >= 0.85) {
      watchedReported.current = true;
      onWatched();
    }

    if (!autoSkip) return;
    const seg = skipTimes.find((s) => time >= s.start && time < s.end - 1);
    if (!seg) return;
    const id = `${seg.type}:${seg.start}`;
    if (autoSkipped.current.has(id)) return;
    autoSkipped.current.add(id);
    skipSegment(seg);
  }

  function handleSeek(e) {
    const v = videoRef.current;
    const next = Number(e.target.value);
    v.currentTime = next;
    setCurrent(next);
  }

  function handleVolume(e) {
    const v = videoRef.current;
    const next = Number(e.target.value);
    v.volume = next;
    v.muted = next === 0;
  }

  function toggleMute() {
    const v = videoRef.current;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.5;
  }

  function chooseSpeed(rate) {
    videoRef.current.playbackRate = rate;
    setSpeed(rate);
    setMenuOpen(false);
  }

  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    try {
      if (fullscreenElement()) {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      } else if (wrap.requestFullscreen) {
        await wrap.requestFullscreen({ navigationUI: "hide" });
        if (window.matchMedia("(pointer: coarse)").matches) {
          await screen.orientation?.lock?.(v.videoWidth && v.videoHeight > v.videoWidth ? "portrait" : "landscape").catch(() => {});
        }
      } else if (wrap.webkitRequestFullscreen) {
        wrap.webkitRequestFullscreen();
      } else if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen failed:", err);
    }
  }

  async function togglePip() {
    const v = videoRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await v.requestPictureInPicture();
    } catch (err) {
      console.error("Picture-in-picture failed:", err);
    }
  }

  function handleKeyDown(e) {
    if (e.target.tagName === "INPUT") return;
    switch (e.key) {
      case " ":
      case "k":
        if (e.target.tagName === "BUTTON" && e.key === " ") return;
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        skip(-SKIP_SECONDS);
        break;
      case "ArrowRight":
        e.preventDefault();
        skip(SKIP_SECONDS);
        break;
      case "m":
        toggleMute();
        break;
      case "f":
        toggleFullscreen();
        break;
      default:
        return;
    }
    wake();
  }

  const progressPct = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const shownVolume = muted ? 0 : volume;
  const volumeIcon =
    shownVolume === 0 ? "volume_off" : shownVolume < 0.5 ? "volume_down" : "volume_up";
  const pipSupported = typeof document !== "undefined" && document.pictureInPictureEnabled;
  const showControls = controlsVisible || !playing || menuOpen;

  return (
    <div
      ref={wrapRef}
      className={`player${showControls ? "" : " is-idle"}${fullscreen ? " is-fullscreen" : ""}`}
      onMouseMove={wake}
      onMouseLeave={() => playing && setControlsVisible(false)}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <video
        ref={videoRef}
        className="player__video"
        autoPlay={autoPlay}
        playsInline
        crossOrigin="anonymous"
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
          controlsWereVisible.current = showControls;
        }}
        onClick={(e) => {
          if (phoneLike()) {
            handleTap(e);
            return;
          }
          togglePlay();
          wake();
        }}
        onDoubleClick={() => !phoneLike() && toggleFullscreen()}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          wake();
        }}
        onError={() => kind === "file" && setFailed(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={handleTimeUpdate}
        onProgress={(e) => {
          const v = e.currentTarget;
          const t = v.currentTime;
          for (let i = 0; i < v.buffered.length; i++) {
            if (v.buffered.start(i) <= t && t <= v.buffered.end(i)) {
              setBuffered(v.buffered.end(i));
              break;
            }
          }
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
      >
        {subtitles && (
          <track kind="subtitles" src={subtitles} srcLang="en" label="Subtitles" default />
        )}
      </video>

      {!playing && (
        <button
          type="button"
          className="player__big-play"
          aria-label={started ? "Resume" : "Play"}
          onClick={togglePlay}
        >
          <Icon name="play_arrow" filled />
        </button>
      )}

      {flash && (
        <div key={flash.id} className={`player__flash player__flash--${flash.side}`} aria-hidden="true">
          <Icon name={flash.side === "left" ? "fast_rewind" : "fast_forward"} filled />
          <span>{flash.side === "left" ? "-" : "+"}{flash.seconds}s</span>
        </div>
      )}

      {activeSegment && (
        <button
          type="button"
          className="player__skip"
          onClick={() => skipSegment(activeSegment)}
        >
          {activeSegment.type === "op" ? "Skip Opening" : "Skip Ending"}
          <Icon name="skip_next" filled />
        </button>
      )}

      <div className="player__controls">
        <input
          className="player__seek"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={current}
          onChange={handleSeek}
          aria-label="Seek"
          aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
          style={{
            "--played": `${progressPct}%`,
            "--buffered": `${bufferedPct}%`,
          }}
        />

        <div className="player__row">
          <div className="player__group">
            <button type="button" className="player__btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              <Icon name={playing ? "pause" : "play_arrow"} filled />
            </button>
            <button type="button" className="player__btn" onClick={() => skip(-SKIP_SECONDS)} aria-label={`Back ${SKIP_SECONDS} seconds`}>
              <Icon name="fast_rewind" filled />
            </button>
            <button type="button" className="player__btn" onClick={() => skip(SKIP_SECONDS)} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
              <Icon name="fast_forward" filled />
            </button>
            <span className="player__time">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>

          <div className="player__group">
            <button type="button" className="player__btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              <Icon name={volumeIcon} filled />
            </button>
            <input
              className="player__volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={shownVolume}
              onChange={handleVolume}
              aria-label="Volume"
              style={{ "--played": `${shownVolume * 100}%` }}
            />

            <div className="player__menu-wrap">
              <button
                type="button"
                className="player__btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Settings"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Icon name="settings" filled />
              </button>
              {menuOpen && (
                <div className="player__menu" role="menu" aria-label="Playback speed">
                  <p className="player__menu-title">Speed</p>
                  {SPEEDS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      role="menuitemradio"
                      aria-checked={rate === speed}
                      className={`player__menu-item${rate === speed ? " is-active" : ""}`}
                      onClick={() => chooseSpeed(rate)}
                    >
                      {rate === 1 ? "Normal" : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {pipSupported && (
              <button type="button" className="player__btn" onClick={togglePip} aria-label="Picture in picture">
                <Icon name="picture_in_picture_alt" />
              </button>
            )}
            <button type="button" className="player__btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
              <Icon name={fullscreen ? "fullscreen_exit" : "fullscreen"} />
            </button>
          </div>
        </div>
      </div>

      {failed && (
        <p className="player__error" role="alert">
          The video stopped loading. Try the episode again, or check the server terminal.
        </p>
      )}
    </div>
  );
}

export default Player;
