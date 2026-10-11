import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getSettings, useSettings, vibrate } from "./store/settings";
import { canAutoDownload } from "./store/network";
import { hlsBufferConfig, saveIntervalMs } from "./playback/config";
import { isTextEntry } from "./vim/spatial";

const SKIP_SECONDS = 10;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DOUBLE_TAP_MS = 300;
const STREAK_MS = 600;
const FLASH_MS = 700;
const HOLD_MS = 450;
const HOLD_SPEED = 2;
const MIN_RESUME_SECONDS = 15;
const SUB_SIZES = [["small", "S"], ["medium", "M"], ["large", "L"], ["xlarge", "XL"]];
const SUB_BACKGROUNDS = [[0, "None"], [0.4, "Soft"], [0.75, "Solid"]];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// WebVTT cues can carry styling tags and ASS leftovers like {\an8}; show plain text lines.
const cleanCue = (text) => String(text).replace(/\{[^}]*\}/g, "").replace(/<[^>]+>/g, "").trim();

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

function Player({
  src,
  kind = "hls",
  subtitles,
  skipTimes = [],
  autoSkip = false,
  autoPlay = true,
  onEnded,
  onWatched,
  startAt = 0,
  initialSpeed = 1,
  onSpeedChange,
  subSize = null,
  onSubSize,
  onProgress,
  nextEpisode = null,
  onNext,
  autoNext = false,
}) {
  const [settings, updateSettings] = useSettings();
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
  const trackRef = useRef(null);
  const resumedRef = useRef(false);
  const resumeTimer = useRef(null);
  const holdTimer = useRef(null);
  const hudTimer = useRef(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const lastKnown = useRef({ time: 0, duration: 0 });
  const lastMedia = useRef(0);
  const pendingDelta = useRef(0);
  const lastFlush = useRef(0);
  const onProgressRef = useRef(onProgress);
  const onNextRef = useRef(onNext);

  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [started, setStarted] = useState(false);
  const [flash, setFlash] = useState(null);
  const [cues, setCues] = useState([]);
  const [resumeNote, setResumeNote] = useState(null);
  const [endCard, setEndCard] = useState(null);
  const [holding, setHolding] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [hud, setHud] = useState(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onNextRef.current = onNext;
  });

  const shownSubSize = subSize ?? settings.subSize;

  // Report where we are (for resume, "continue watching" and stats). Cheap, so called often.
  const flushProgress = useCallback(() => {
    const { time, duration: total } = lastKnown.current;
    const delta = pendingDelta.current;
    pendingDelta.current = 0;
    lastFlush.current = Date.now();
    if (time > 0 || delta > 0) onProgressRef.current?.({ time, duration: total, delta });
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushProgress();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushProgress);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushProgress);
      flushProgress();
    };
  }, [flushProgress]);

  // Draw subtitles ourselves so size, background and position are adjustable.
  useEffect(() => {
    const track = trackRef.current?.track;
    if (!track) return;
    track.mode = "hidden";
    const update = () =>
      setCues(
        Array.from(track.activeCues ?? [])
          .map((c) => cleanCue(c.text))
          .filter(Boolean),
      );
    track.addEventListener("cuechange", update);
    return () => {
      track.removeEventListener("cuechange", update);
      setCues([]);
    };
  }, [subtitles]);

  useEffect(() => {
    const video = videoRef.current;

    if (kind === "file") {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      // "Buffer ahead" from Settings. Only applies to streamed (HLS) playback; saved files ignore it.
      // Read at creation, so a changed setting takes effect from the next episode you open.
      const { bufferAheadSeconds, wifiOnly } = getSettings();
      const hls = new Hls(hlsBufferConfig(bufferAheadSeconds, canAutoDownload(wifiOnly)));
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
      clearTimeout(resumeTimer.current);
      clearTimeout(holdTimer.current);
      clearTimeout(hudTimer.current);
    },
    [],
  );

  // "Next episode in 5s": counts down after the episode ends, if there is a next one.
  useEffect(() => {
    if (!endCard || endCard.left == null || endCard.going) return;
    if (endCard.left <= 0) {
      setEndCard({ left: null, going: true });
      onNextRef.current?.();
      return;
    }
    const timer = setTimeout(() => setEndCard((c) => c && c.left != null && { ...c, left: c.left - 1 }), 1000);
    return () => clearTimeout(timer);
  }, [endCard]);

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
    vibrate(8);
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

    const step = time - lastMedia.current;
    if (step > 0 && step < 2.5 && !e.currentTarget.paused) pendingDelta.current += step;
    lastMedia.current = time;
    lastKnown.current = { time, duration: e.currentTarget.duration || 0 };
    // Read at call time so changing the setting applies to the video that is already playing.
    if (Date.now() - lastFlush.current > saveIntervalMs(getSettings().saveEverySeconds)) flushProgress();

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
    onSpeedChange?.(rate);
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

  function handleLoadedMetadata(e) {
    const v = e.currentTarget;
    setDuration(v.duration);
    if (initialSpeed !== 1) v.playbackRate = initialSpeed;
    if (resumedRef.current) return;
    resumedRef.current = true;
    if (startAt >= MIN_RESUME_SECONDS && Number.isFinite(v.duration) && startAt < v.duration - 20) {
      v.currentTime = startAt;
      lastMedia.current = startAt;
      setResumeNote(startAt);
      clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => setResumeNote(null), 7000);
    }
  }

  function startOver() {
    const v = videoRef.current;
    if (v) v.currentTime = 0;
    setResumeNote(null);
  }

  function showHud(icon, label, value) {
    setHud({ icon, label, value });
    clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(null), 900);
  }

  function gestureStart(e) {
    if (e.pointerType === "mouse" || !settings.gestures) return;
    const v = videoRef.current;
    const box = e.currentTarget.getBoundingClientRect();
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      side: e.clientX - box.left < box.width / 2 ? "left" : "right",
      height: box.height,
      mode: null,
      volume: v.muted ? 0 : v.volume,
      brightness,
      rate: v.playbackRate,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const g = gesture.current;
      if (!g || g.mode || v.paused) return;
      g.mode = "hold";
      suppressClick.current = true;
      v.playbackRate = HOLD_SPEED;
      setHolding(true);
      vibrate(15);
    }, HOLD_MS);
  }

  function gestureMove(e) {
    const g = gesture.current;
    if (!g || g.mode === "hold") return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    if (!g.mode) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(holdTimer.current);
      // Swipes only work in fullscreen, so scrolling the page with a finger on the video still works.
      if (fullscreen && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        g.mode = g.side === "left" ? "brightness" : "volume";
        suppressClick.current = true;
      } else return;
    }

    const delta = -dy / (g.height * 0.8);
    if (g.mode === "volume") {
      const next = clamp(g.volume + delta, 0, 1);
      const v = videoRef.current;
      v.volume = next;
      v.muted = next === 0;
      showHud(next === 0 ? "volume_off" : next < 0.5 ? "volume_down" : "volume_up", `${Math.round(next * 100)}%`, next);
    } else {
      const next = clamp(g.brightness + delta, 0.3, 1.5);
      setBrightness(next);
      showHud("brightness_6", `${Math.round(next * 100)}%`, (next - 0.3) / 1.2);
    }
  }

  function gestureEnd() {
    clearTimeout(holdTimer.current);
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.mode === "hold") {
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      setHolding(false);
    }
    if (g.mode) setTimeout(() => (suppressClick.current = false), 60);
  }

  // Keys go to the player when it (or nothing) has focus. Listening on the
  // window means no click is needed first, so the page works keyboard-only.
  function handleKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (isTextEntry(t)) return;
    const wrap = wrapRef.current;
    const onBody = !t || t === document.body || t === document.documentElement;
    if (!onBody && !wrap?.contains(t)) return;
    if (t?.tagName === "INPUT" && e.key.startsWith("Arrow")) return;
    const v = videoRef.current;
    if (!v) return;

    switch (e.key) {
      case " ":
      case "p":
        if (t?.tagName === "BUTTON" && e.key === " ") return;
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
      case "h":
        e.preventDefault();
        skip(-SKIP_SECONDS);
        break;
      case "ArrowRight":
      case "l":
        e.preventDefault();
        skip(SKIP_SECONDS);
        break;
      case "j":
      case "k": {
        e.preventDefault();
        const next = Math.min(1, Math.max(0, (v.muted ? 0 : v.volume) + (e.key === "k" ? 0.1 : -0.1)));
        v.volume = Math.round(next * 10) / 10;
        v.muted = v.volume === 0;
        break;
      }
      case "0":
        v.currentTime = 0;
        break;
      case "s":
        if (activeSegment) skipSegment(activeSegment);
        break;
      case "[":
      case "]": {
        const at = SPEEDS.indexOf(speed);
        const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, at + (e.key === "]" ? 1 : -1)))];
        v.playbackRate = next;
        setSpeed(next);
        break;
      }
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

  const keyHandler = useRef(handleKeyDown);
  useEffect(() => {
    keyHandler.current = handleKeyDown;
  });
  useEffect(() => {
    const onKey = (e) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      tabIndex={-1}
    >
      <video
        ref={videoRef}
        className="player__video"
        autoPlay={autoPlay}
        playsInline
        crossOrigin="anonymous"
        style={brightness !== 1 ? { filter: `brightness(${brightness})` } : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
          controlsWereVisible.current = showControls;
          gestureStart(e);
        }}
        onPointerMove={gestureMove}
        onPointerUp={gestureEnd}
        onPointerCancel={gestureEnd}
        onClick={(e) => {
          if (suppressClick.current) return;
          if (phoneLike()) {
            handleTap(e);
            return;
          }
          togglePlay();
          wake();
        }}
        onDoubleClick={() => !phoneLike() && toggleFullscreen()}
        onPlay={() => {
          setEndCard((c) => (c?.going ? c : null));
          setPlaying(true);
          setStarted(true);
          wake();
        }}
        onError={() => kind === "file" && setFailed(true)}
        onPause={() => {
          setPlaying(false);
          flushProgress();
        }}
        onEnded={() => {
          setPlaying(false);
          flushProgress();
          if (nextEpisode != null) setEndCard({ left: autoNext ? settings.countdownSeconds : null });
          onEnded?.();
        }}
        onSeeked={(e) => {
          // Save the new spot as soon as a seek lands, not only at the next interval.
          const v = e.currentTarget;
          lastMedia.current = v.currentTime;
          lastKnown.current = { time: v.currentTime, duration: v.duration || 0 };
          flushProgress();
        }}
        onLoadedMetadata={handleLoadedMetadata}
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
          <track ref={trackRef} kind="subtitles" src={subtitles} srcLang="en" label="Subtitles" />
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

      {settings.subEnabled && cues.length > 0 && (
        <div
          className={`player__subs player__subs--${shownSubSize} player__subs--${settings.subPos}`}
          style={{ "--sub-bg": `rgba(0, 0, 0, ${settings.subBg})` }}
          aria-hidden="true"
        >
          {cues.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {holding && (
        <div className="player__badge" aria-hidden="true">
          <Icon name="fast_forward" filled /> {HOLD_SPEED}x
        </div>
      )}

      {hud && (
        <div className="player__hud" aria-hidden="true">
          <Icon name={hud.icon} filled />
          <span className="player__hud-bar">
            <span style={{ height: `${Math.round(hud.value * 100)}%` }} />
          </span>
          <span>{hud.label}</span>
        </div>
      )}

      {resumeNote != null && (
        <div className="player__toast" role="status">
          <span>Resumed at {formatTime(resumeNote)}</span>
          <button type="button" onClick={startOver}>
            Start over
          </button>
        </div>
      )}

      {endCard && nextEpisode != null && (
        <div className="player__next" role="dialog" aria-label="Next episode">
          <p className="player__next-label">
            {endCard.going ? "Loading…" : endCard.left != null ? `Next episode in ${endCard.left}s` : "Episode finished"}
          </p>
          <p className="player__next-title">Episode {nextEpisode}</p>
          <div className="player__next-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={endCard.going}
              onClick={() => {
                setEndCard({ left: null, going: true });
                onNext?.();
              }}
            >
              <Icon name="skip_next" filled /> Play now
            </button>
            {endCard.left != null && (
              <button type="button" className="btn btn--outline" onClick={() => setEndCard({ left: null })}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn--outline"
              disabled={endCard.going}
              onClick={() => {
                setEndCard(null);
                const v = videoRef.current;
                if (v) {
                  v.currentTime = 0;
                  v.play().catch(() => {});
                }
              }}
            >
              <Icon name="replay" /> Replay
            </button>
          </div>
          {endCard.left != null && !endCard.going && (
            <span className="player__next-bar" style={{ animationDuration: `${settings.countdownSeconds}s` }} />
          )}
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
                <div className="player__menu" role="menu" aria-label="Player settings">
                  <p className="player__menu-title">Speed</p>
                  <div className="player__chips">
                    {SPEEDS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        role="menuitemradio"
                        aria-checked={rate === speed}
                        className={`player__chip${rate === speed ? " is-active" : ""}`}
                        onClick={() => chooseSpeed(rate)}
                      >
                        {rate === 1 ? "1x" : `${rate}x`}
                      </button>
                    ))}
                  </div>

                  {subtitles && (
                    <>
                      <p className="player__menu-title">Subtitles</p>
                      <div className="player__chips">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={settings.subEnabled}
                          className={`player__chip${settings.subEnabled ? " is-active" : ""}`}
                          onClick={() => updateSettings({ subEnabled: !settings.subEnabled })}
                        >
                          {settings.subEnabled ? "On" : "Off"}
                        </button>
                      </div>

                      <p className="player__menu-sub">Size (this show)</p>
                      <div className="player__chips">
                        {SUB_SIZES.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={shownSubSize === value}
                            className={`player__chip${shownSubSize === value ? " is-active" : ""}`}
                            onClick={() => onSubSize?.(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <p className="player__menu-sub">Background</p>
                      <div className="player__chips">
                        {SUB_BACKGROUNDS.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={settings.subBg === value}
                            className={`player__chip${settings.subBg === value ? " is-active" : ""}`}
                            onClick={() => updateSettings({ subBg: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <p className="player__menu-sub">Position</p>
                      <div className="player__chips">
                        {[["low", "Low"], ["high", "High"]].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={settings.subPos === value}
                            className={`player__chip${settings.subPos === value ? " is-active" : ""}`}
                            onClick={() => updateSettings({ subPos: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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
