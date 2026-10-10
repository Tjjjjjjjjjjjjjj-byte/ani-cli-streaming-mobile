import { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UA } from "../config.js";

const router = Router();

export const originOf = (req) => `${req.protocol}://${req.get("host")}`;
const allowedHosts = new Set();

export function proxied(target, referer, base, origin) {
  const absolute = new URL(target, base);
  allowedHosts.add(absolute.host);
  const params = new URLSearchParams({ url: absolute.href, referer });
  return `${origin}/proxy?${params}`;
}

function rewritePlaylist(text, base, referer, origin) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_, uri) => `URI="${proxied(uri, referer, base, origin)}"`,
        );
      }
      return proxied(trimmed, referer, base, origin);
    })
    .join("\n");
}

router.get("/proxy", async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url));
  } catch {
    return res.status(400).json({ error: "Bad url." });
  }
  if (!["http:", "https:"].includes(target.protocol) || !allowedHosts.has(target.host)) {
    console.warn("Proxy blocked a host that isn't allowed:", target.host);
    return res.status(403).json({ error: "Host not allowed." });
  }

  const referer = String(req.query.referer ?? "");

  try {
    const headers = { "User-Agent": UA, ...(referer && { Referer: referer }) };
    let upstream = await fetch(target, { headers });

    if (upstream.status === 403) {
      console.warn(`Got 403 for ${target.pathname}, retrying with a fresh address`);
      await upstream.body?.cancel();
      const retry = new URL(target);
      retry.searchParams.set("cb", Date.now());
      upstream = await fetch(retry, { headers });
    }

    if (!upstream.ok) {
      console.warn(`Video host answered ${upstream.status} for ${target.href}`);
      return res.status(upstream.status).end();
    }

    const type = upstream.headers.get("content-type") ?? "";
    const isPlaylist = type.includes("mpegurl") || target.pathname.endsWith(".m3u8");

    if (isPlaylist) {
      const text = await upstream.text();
      res.type("application/vnd.apple.mpegurl");
      return res.send(rewritePlaylist(text, target, referer, originOf(req)));
    }

    res.type(type || "application/octet-stream");
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (error.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    console.error("Proxy failed:", error);
    if (!res.headersSent) res.status(502).json({ error: error.message });
  }
});

export default router;
