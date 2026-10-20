'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const versions = path.resolve(process.env.ASSET_VERSION_DIR || path.join(root, '.versions'));
(async () => {
  const label = process.argv[2] || 'source';
  if (!/^[a-zA-Z0-9_.-]{1,70}$/.test(label))
    throw new Error('版本标签仅使用字母、数字、点、短横线与下划线');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(versions, `${label}-${stamp}`);
  await fs.mkdir(target, { recursive: true });
  for (const part of [
    'desktop',
    'server',
    'ui',
    'vendor',
    'licenses',
    'scripts',
    'package.json',
    'package-lock.json',
    'README.md',
    'OPEN_SOURCE.md',
    '.prettierrc.json',
    '.prettierignore',
    '.gitignore',
    'AI_HANDOFF.md',
    'VALIDATION.md',
    'tests',
  ]) {
    try {
      await fs.cp(path.join(root, part), path.join(target, 'source', part), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const manifest = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        const content = await fs.readFile(file);
        manifest.push({
          path: path.relative(target, file),
          bytes: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
        });
      }
    }
  }
  await visit(path.join(target, 'source'));
  await fs.writeFile(
    path.join(target, 'manifest.json'),
    JSON.stringify({ label, created_at: new Date().toISOString(), files: manifest }, null, 2),
  );
  console.log(target);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
