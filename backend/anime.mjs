import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

const BASH = "bash";
const BASH_FLAGS = ["-c"];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRINTER = path.join(HERE, "mpv-print").replaceAll("\\", "/");

const SCRIPT =
  'DUB=""; [ "$4" = dub ] && DUB="--dub"; ANI_CLI_PLAYER="$3" ani-cli -S 1 -e "$1" --exit-after-play $DUB "$2"';

const FETCH_SCRIPT = `
OUT="$3"
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp "$1" --referer "$2" --user-agent "$4" --no-warnings --newline --socket-timeout 30 --retries 10 --extractor-retries 5 --fragment-retries 20 --no-skip-unavailable-fragments -N 8 -o "$OUT"
else
  ffmpeg -nostdin -loglevel error -stats -user_agent "$4" -headers "Referer: $2"$'\r\n' -i "$1" -c copy -y "$OUT"
fi
`;

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const ATTEMPTS = 3;

const DOWNLOAD_TIMEOUT = 30 * 60_000;

function parseOutput(text) {
  const referer = text.match(/--referrer=(\S+)/)?.[1] ?? null;
  const subtitles = text.match(/--sub-file=(\S+)/)?.[1] ?? null;
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  const url = urls.at(-1) ?? null;
  return { url, referer, subtitles };
}

async function runAniCli(title, episode, lang) {
  try {
    const { stdout } = await execFileAsync(
      BASH,
      [...BASH_FLAGS, SCRIPT, "bash", String(episode), title, PRINTER, lang],
      { timeout: 60_000 },
    );
    return stdout;
  } catch (err) {
    throw new Error(err.stderr?.trim() || err.message);
  }
}

export async function getLink(title, episode, lang = "sub") {
  const stdout = await runAniCli(title, episode, lang);
  const result = parseOutput(stdout);

  if (!result.url || !result.referer) {
    throw new Error("Couldn't find a link in ani-cli's output.");
  }

  if (lang === "dub") result.subtitles = null;
  return result;
}

function fetchStream(link, file, episode) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      BASH,
      [...BASH_FLAGS, FETCH_SCRIPT, "bash", link.url, link.referer, file, UA],
      {
        cwd: path.dirname(file),
        env: { ...process.env, CHERE_INVOKING: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let tail = "";
    let lastEcho = 0;
    const onData = (chunk) => {
      tail = (tail + chunk).slice(-2000);
      const now = Date.now();
      if (now - lastEcho < 3000) return;
      lastEcho = now;
      const line = String(chunk).split(/[\r\n]+/).filter(Boolean).at(-1);
      if (line) console.log(`[download ep ${episode}] ${line.slice(0, 200)}`);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The download took too long and was stopped."));
    }, DOWNLOAD_TIMEOUT);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", async (code) => {
      clearTimeout(timer);
      console.log(`[download ep ${episode}] exited with code ${code}`);
      const size = await fs.stat(file).then((st) => st.size, () => 0);
      if (code === 0 && size > 0) resolve();
      else reject(new Error(tail.trim().split(/\r?\n/).slice(-3).join(" | ") || `The downloader exited with code ${code}.`));
    });
  });
}

export async function downloadEpisode(title, episode, lang, dir, onStage = () => {}) {
  onStage("finding");
  const link = await getLink(title, episode, lang);
  const file = path.join(dir, `ep${episode}.mp4`);

  onStage("downloading");
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await fetchStream(link, file, episode);
      return { file, subtitles: link.subtitles, referer: link.referer };
    } catch (error) {
      lastError = error;
      console.warn(`Download of episode ${episode} failed (attempt ${attempt} of ${ATTEMPTS}): ${error.message}`);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}
