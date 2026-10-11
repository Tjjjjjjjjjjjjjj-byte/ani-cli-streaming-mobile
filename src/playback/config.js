// Playback tuning that comes from Settings. Pure functions, so they are easy to test.

export const SAVE_INTERVAL_OPTIONS = [[2, "2s"], [5, "5s"], [10, "10s"], [30, "30s"]];
export const BUFFER_OPTIONS = [[0, "Normal"], [120, "2 min"], [300, "5 min"], [600, "10 min"]];

const DEFAULT_SAVE_SECONDS = 5;

// How often the player reports its position, in ms. Anything that isn't one of the options falls back to 5s.
export function saveIntervalMs(seconds) {
  const ok = SAVE_INTERVAL_OPTIONS.some(([value]) => value === seconds);
  return (ok ? seconds : DEFAULT_SAVE_SECONDS) * 1000;
}

// hls.js stops buffering at whichever comes first: maxBufferLength / maxMaxBufferLength (seconds)
// or maxBufferSize (bytes). Its default size cap (~60 MB) would end a 10 minute buffer long before 10
// minutes of a typical stream, so the byte cap is raised along with the seconds.
// Budget: 1.25 MB per second (about 10 Mbit/s), more than anime streams normally need.
const BYTES_PER_SECOND = 1_250_000;

// Returns the hls.js config overrides for the chosen "buffer ahead" value.
// Returns {} (hls.js defaults, i.e. exactly what the player did before) when the setting is Normal,
// or when we shouldn't prefetch heavily right now (Wi-Fi only on a metered connection, or Data Saver on).
export function hlsBufferConfig(bufferAheadSeconds, canPrefetch = true) {
  const known = BUFFER_OPTIONS.some(([value]) => value === bufferAheadSeconds);
  if (!known || bufferAheadSeconds <= 0 || !canPrefetch) return {};
  return {
    maxBufferLength: bufferAheadSeconds,
    maxMaxBufferLength: bufferAheadSeconds,
    maxBufferSize: bufferAheadSeconds * BYTES_PER_SECOND,
    // Keep some already-played video so short rewinds stay instant, but let the rest go so memory can't grow forever.
    backBufferLength: Math.min(120, Math.max(30, bufferAheadSeconds / 5)),
  };
}
