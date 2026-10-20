'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'tif',
  'tiff',
  'avif',
  'heic',
  'heif',
  'bmp',
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv',
  'avi',
]);
async function scanImports(roots, { maxFiles = 20000, maxEntries = 50000 } = {}) {
  const files = [],
    warnings = [];
  const seen = new Set();
  let skipped = 0,
    entries = 0;
  async function visit(file, folders) {
    if (++entries > maxEntries) throw new Error('文件夹项目过多，请分批拖入较小的子文件夹');
    let stat;
    try {
      stat = await fs.lstat(file);
    } catch (e) {
      warnings.push(`无法读取：${file}（${e.code || '读取失败'}）`);
      return;
    }
    if (stat.isSymbolicLink()) {
      skipped++;
      return;
    }
    if (stat.isDirectory()) {
      if (folders.length >= 128) throw new Error('文件夹层级过深，请分批导入子文件夹');
      const name = path.basename(file);
      if (!name) throw new Error('请拖入具体素材文件夹，而不是整个磁盘');
      let children;
      try {
        children = await fs.readdir(file, { withFileTypes: true });
      } catch (e) {
        warnings.push(`无法读取文件夹：${file}（${e.code || '读取失败'}）`);
        return;
      }
      children.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      for (const child of children) await visit(path.join(file, child.name), [...folders, name]);
    } else if (stat.isFile()) {
      if (!EXTENSIONS.has(path.extname(file).slice(1).toLowerCase())) {
        skipped++;
        return;
      }
      const key = path.resolve(file).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (files.length >= maxFiles)
        throw new Error(`一次最多导入 ${maxFiles} 个素材，请分批拖入子文件夹`);
      files.push({ path: file, name: path.basename(file), folders, size: stat.size });
    } else skipped++;
  }
  for (const root of roots) await visit(path.resolve(root), []);
  return { files, skipped, warnings };
}
module.exports = { scanImports };
