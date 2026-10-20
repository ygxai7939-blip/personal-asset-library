'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');
const run = promisify(execFile);
const { now } = require('./store.cjs');
const allowedImages = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'tiff',
  'tif',
  'avif',
  'heic',
  'heif',
  'bmp',
]);
const allowedVideos = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']);
const mimeMap = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};
const importLocks = new Map();
async function withImportLock(key, action) {
  const previous = importLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  importLocks.set(key, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (importLocks.get(key) === current) importLocks.delete(key);
  }
}

function fileKind(extension) {
  return allowedImages.has(extension) ? 'image' : allowedVideos.has(extension) ? 'video' : null;
}
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function objectPath(root, asset) {
  return path.join(root, 'originals', asset.hash.slice(0, 2), `${asset.hash}.${asset.extension}`);
}
function thumbPath(dataDir, asset) {
  return path.join(dataDir, 'thumbs', `${asset.id}.jpg`);
}

async function importFile(
  store,
  input,
  { dataDir, mediaDir, user, name, categories = [], tags = [] },
) {
  const originalName = String(name || '未命名')
    .normalize('NFC')
    .replace(/[\\/\x00-\x1f]/g, '_')
    .slice(0, 240);
  const extension = path.extname(originalName).slice(1).toLowerCase();
  const kind = fileKind(extension);
  if (!kind) throw new Error('暂不支持此格式，请导入图片或视频');
  const stat = await fsp.stat(input),
    hash = await hashFile(input);
  if (!stat.size) throw new Error('不能导入空文件');
  // One process owns the library; serialize same-content imports to avoid replacing
  // a Windows file while another import's thumbnail worker already holds it open.
  return withImportLock(`${path.resolve(mediaDir)}:${hash}`, async () => {
    const existing = store.db.prepare('SELECT * FROM assets WHERE hash=?').get(hash);
    if (existing) {
      if (existing.deleted_at)
        throw Object.assign(new Error('相同素材在回收站，请先恢复后再添加分类'), { status: 409 });
      await fsp.access(objectPath(mediaDir, existing));
      store.tx(() => store.addRelations([existing.id], categories, tags));
      return { asset: store.getAsset(existing.id), duplicate: true };
    }
    let metadata = {};
    if (kind === 'image') {
      try {
        metadata = await sharp(input, { limitInputPixels: 160000000 }).metadata();
      } catch {
        throw new Error('图片无法解码或尺寸过大；原文件未入库');
      }
    } else {
      const handle = await fsp.open(input, 'r');
      const header = Buffer.alloc(16);
      await handle.read(header, 0, 16, 0);
      await handle.close();
      const valid =
        header.includes(Buffer.from('ftyp')) ||
        header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
        header.toString('ascii', 0, 4) === 'RIFF';
      if (!valid) throw new Error('视频文件头无法识别，未入库');
    }
    const id = randomUUID(),
      time = now();
    const asset = { id, hash, extension, kind };
    const final = objectPath(mediaDir, asset),
      stage = `${final}.${id}.part`;
    await fsp.mkdir(path.dirname(final), { recursive: true });
    try {
      await pipeline(fs.createReadStream(input), fs.createWriteStream(stage, { flags: 'wx' }));
      if ((await fsp.stat(stage)).size !== stat.size || (await hashFile(stage)) !== hash)
        throw new Error('写入校验失败，请重试');
      await fsp.rename(stage, final);
      try {
        store.tx(() => {
          store.db
            .prepare(
              `INSERT INTO assets(id,hash,name,original_name,extension,mime,kind,size,width,height,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(
              id,
              hash,
              path.parse(originalName).name,
              originalName,
              extension,
              mimeMap[extension] || 'application/octet-stream',
              kind,
              stat.size,
              metadata.width || null,
              metadata.height || null,
              user.id,
              time,
              time,
            );
          store.addRelations([id], categories, tags);
        });
      } catch (error) {
        const winner = store.db.prepare('SELECT * FROM assets WHERE hash=?').get(hash);
        if (winner && !winner.deleted_at) {
          store.tx(() => store.addRelations([winner.id], categories, tags));
          return { asset: store.getAsset(winner.id), duplicate: true };
        }
        // Keep an unreferenced validated object rather than deleting a possible concurrent import.
        throw error;
      }
      return { asset: store.getAsset(id), duplicate: false };
    } finally {
      await fsp.rm(stage, { force: true }).catch(() => {});
    }
  });
}

function createPreviewQueue(
  store,
  { dataDir, mediaDir, ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe' },
) {
  const pending = [],
    queued = new Set();
  let running = false,
    stopping = false;
  fs.mkdirSync(path.join(dataDir, 'thumbs'), { recursive: true });
  async function processNext() {
    if (running || stopping || !pending.length) return;
    running = true;
    const id = pending.shift();
    const asset = store.getAsset(id);
    try {
      if (asset && !asset.deleted_at) {
        const source = objectPath(mediaDir, asset),
          dest = thumbPath(dataDir, asset),
          temporary = `${dest}.part.jpg`;
        if (asset.kind === 'image') {
          await sharp(source, { limitInputPixels: 160000000 })
            .rotate()
            .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#252930' })
            .jpeg({ quality: 82 })
            .toFile(temporary);
        } else {
          try {
            const { stdout } = await run(
              ffprobePath,
              ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', source],
              { timeout: 20000, windowsHide: true },
            );
            const probe = JSON.parse(stdout),
              video = probe.streams?.find((s) => s.codec_type === 'video');
            store.db
              .prepare('UPDATE assets SET width=?,height=?,duration=? WHERE id=?')
              .run(
                video?.width || null,
                video?.height || null,
                Number(probe.format?.duration) || null,
                id,
              );
          } catch {}
          await run(
            ffmpegPath,
            [
              '-v',
              'error',
              '-y',
              '-i',
              source,
              '-frames:v',
              '1',
              '-vf',
              'scale=640:640:force_original_aspect_ratio=decrease',
              temporary,
            ],
            { timeout: 90000, windowsHide: true },
          );
        }
        await fsp.rename(temporary, dest);
        store.db.prepare("UPDATE assets SET thumb_status='ready' WHERE id=?").run(id);
      }
    } catch {
      if (asset)
        store.db.prepare("UPDATE assets SET thumb_status='unavailable' WHERE id=?").run(id);
    } finally {
      queued.delete(id);
      running = false;
      setImmediate(processNext);
    }
  }
  return {
    enqueue(id) {
      const asset = store.getAsset(id);
      if (asset?.thumb_status === 'ready' && fs.existsSync(thumbPath(dataDir, asset))) return;
      if (!queued.has(id)) {
        queued.add(id);
        pending.push(id);
        processNext();
      }
    },
    async idle() {
      while (running || pending.length) await new Promise((resolve) => setTimeout(resolve, 20));
    },
    async stop() {
      stopping = true;
      while (running) await new Promise((resolve) => setTimeout(resolve, 50));
    },
  };
}
module.exports = { fileKind, objectPath, thumbPath, hashFile, importFile, createPreviewQueue };
