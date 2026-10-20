'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashFile, objectPath } = require('./media.cjs');
async function restoreBackup({ backupDir, dataDir, mediaDir, sourceMediaDir }) {
  if (!backupDir || !dataDir || !mediaDir)
    throw new Error('请提供备份目录、新数据库目录和新素材目录');
  [backupDir, dataDir, mediaDir] = [backupDir, dataDir, mediaDir].map((x) => path.resolve(x));
  if (
    new Set([backupDir, dataDir, mediaDir].map((x) => x.toLowerCase())).size !== 3 ||
    /^(\\\\|\/\/)/.test(dataDir)
  )
    throw new Error('请选择不同目录，数据库必须放本机');
  const manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
  if (!manifest.complete) throw new Error('这份备份没有完成标记，不能恢复');
  if (manifest.metadataOnly && !sourceMediaDir)
    throw new Error('此目录仅为迁移元数据快照，需要原素材目录');
  for (const target of [dataDir, mediaDir]) {
    await fs.mkdir(target, { recursive: true });
    if ((await fs.readdir(target)).length)
      throw new Error('恢复目标必须为空目录，不覆盖任何现有资料');
  }
  const dbSource = path.join(backupDir, 'library.sqlite');
  const snapshot = new DatabaseSync(dbSource, { readOnly: true });
  let assets, libraryId;
  try {
    assets = snapshot.prepare('SELECT * FROM assets').all();
    libraryId = snapshot.prepare("SELECT value FROM settings WHERE key='libraryId'").get().value;
  } finally {
    snapshot.close();
  }
  if (assets.length !== manifest.assets) throw new Error('备份清单与数据库数量不一致');
  for (const asset of assets) {
    const source = objectPath(sourceMediaDir || backupDir, asset);
    if ((await hashFile(source)) !== asset.hash)
      throw new Error(`备份文件校验失败：${asset.original_name}`);
    const destination = objectPath(mediaDir, asset);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    if ((await hashFile(destination)) !== asset.hash) throw new Error('恢复写入校验失败');
  }
  await fs.copyFile(dbSource, path.join(dataDir, 'library.sqlite'));
  const db = new DatabaseSync(path.join(dataDir, 'library.sqlite'));
  try {
    db.prepare("UPDATE settings SET value=? WHERE key='mediaDir'").run(mediaDir);
    db.exec("DELETE FROM sessions; UPDATE assets SET thumb_status='pending';");
  } finally {
    db.close();
  }
  await fs.writeFile(path.join(mediaDir, '.asset-asset-library'), libraryId, { flag: 'wx' });
  return { dataDir, mediaDir, count: assets.length };
}
module.exports = { restoreBackup };
if (require.main === module) {
  restoreBackup({ backupDir: process.argv[2], dataDir: process.argv[3], mediaDir: process.argv[4] })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
