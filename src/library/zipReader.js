const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function bytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export async function readZip(file) {
  const tailLength = Math.min(file.size, 22 + 65535);
  const tail = await bytes(file, file.size - tailLength, file.size);
  const tailView = new DataView(tail.buffer);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This isn't a zip file.");

  let count = tailView.getUint16(eocd + 10, true);
  let directorySize = tailView.getUint32(eocd + 12, true);
  let directoryOffset = tailView.getUint32(eocd + 16, true);

  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tailView.getUint32(locator, true) !== EOCD64_LOCATOR) {
      throw new Error("This zip file is damaged.");
    }
    const recordAt = Number(tailView.getBigUint64(locator + 8, true));
    const record = new DataView((await bytes(file, recordAt, recordAt + 56)).buffer);
    if (record.getUint32(0, true) !== EOCD64) throw new Error("This zip file is damaged.");
    count = Number(record.getBigUint64(32, true));
    directorySize = Number(record.getBigUint64(40, true));
    directoryOffset = Number(record.getBigUint64(48, true));
  }

  const directory = await bytes(file, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer);
  const decoder = new TextDecoder("utf-8");
  const entries = [];

  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > directory.length || view.getUint32(p, true) !== CENTRAL) {
      throw new Error("This zip file is damaged.");
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    let compressedSize = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    let offset = view.getUint32(p + 42, true);
    const name = decoder.decode(directory.subarray(p + 46, p + 46 + nameLength));

    if (size === 0xffffffff || compressedSize === 0xffffffff || offset === 0xffffffff) {
      let q = p + 46 + nameLength;
      const end = q + extraLength;
      while (q + 4 <= end) {
        const id = view.getUint16(q, true);
        const length = view.getUint16(q + 2, true);
        if (id === 1) {
          let r = q + 4;
          if (size === 0xffffffff) { size = Number(view.getBigUint64(r, true)); r += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = Number(view.getBigUint64(r, true)); r += 8; }
          if (offset === 0xffffffff) offset = Number(view.getBigUint64(r, true));
        }
        q += 4 + length;
      }
    }

    if (!name.endsWith("/")) {
      entries.push({
        name: name.replaceAll("\\", "/"),
        method,
        size,
        compressedSize,
        offset,
        encrypted: (flags & 1) !== 0,
      });
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function openEntry(file, entry) {
  if (entry.encrypted) throw new Error("This zip is password protected.");
  const header = new DataView((await bytes(file, entry.offset, entry.offset + 30)).buffer);
  if (header.getUint32(0, true) !== LOCAL) throw new Error("This zip file is damaged.");
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);

  const raw = file.slice(start, start + entry.compressedSize).stream();
  if (entry.method === 0) return raw;
  if (entry.method === 8) return raw.pipeThrough(new DecompressionStream("deflate-raw"));
  throw new Error("This zip uses a compression type the app can't read.");
}

export async function readEntryText(file, entry) {
  return new Response(await openEntry(file, entry)).text();
}
