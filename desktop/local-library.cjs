'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { backup } = require('node:sqlite');
const { createLibraryServer } = require('../server/api.cjs');
const { restoreBackup } = require('../server/restore.cjs');

function inside(parent, child) {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
class LocalLibrary {
  constructor(configPath, defaultRoot) {
    this.configPath = configPath;
    this.defaultRoot = defaultRoot;
    this.server = null;
    this.root = null;
    this.busy = false;
    this.initializing = null;
    this.migration = null;
  }
  async writeConfig(root) {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const temp = `${this.configPath}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ version: 1, root }, null, 2), { flush: true });
    await fs.rename(temp, this.configPath);
  }
  start(root) {
    return createLibraryServer({
      personalOnly: true,
      dataDir: path.join(root, 'database'),
      mediaDir: path.join(root, 'media'),
    });
  }
  async init() {
    if (this.server) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      let configured;
      try {
        configured = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT')
          throw new Error('本地配置无法读取，请保留配置文件后检查；不会新建空库覆盖原库');
      }
      this.root = path.resolve(configured?.root || this.defaultRoot);
      if (configured)
        await fs.access(path.join(this.root, 'database', 'library.sqlite')).catch(() => {
          throw new Error(`原素材库无法访问：${this.root}`);
        });
      this.server = await this.start(this.root);
      try {
        await this.writeConfig(this.root);
      } catch (e) {
        await this.server.close();
        this.server = null;
        throw e;
      }
    })();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  info() {
    return {
      root: this.root,
      dataDir: path.join(this.root, 'database'),
      mediaDir: path.join(this.root, 'media'),
    };
  }
  migrate(target) {
    if (this.busy) return Promise.reject(new Error('已有迁移正在进行'));
    this.busy = true;
    this.migration = this.performMigration(target).finally(() => {
      this.busy = false;
    });
    return this.migration;
  }
  async performMigration(target) {
    if (!this.server) throw new Error('素材库尚未启动');
    if (typeof target !== 'string' || !path.isAbsolute(target) || /^(\\\\|\/\/)/.test(target))
      throw new Error('请选择本机磁盘上的绝对目录');
    const source = await fs.realpath(this.root);
    const dest = await fs.realpath(target);
    if (inside(source, dest) || inside(dest, source))
      throw new Error('新位置与原素材库不能相同或互相包含');
    if ((await fs.readdir(dest)).length) throw new Error('请选择空文件夹，不覆盖已有文件');
    const oldServer = this.server;
    const oldRoot = this.root;
    let nextServer;
    // The desktop blocks writes while busy. The loopback token is private to this process.
    const response = await fetch(`${oldServer.url}/api/admin/storage`, {
      headers: { Authorization: `Bearer ${oldServer.personalSession.token}` },
    });
    const state = await response.json();
    if (!response.ok || state.activeImports) throw new Error('请等素材导入完成后再迁移');
    const snapshotsRoot = path.join(source, 'database', 'migration-snapshots');
    await fs.mkdir(snapshotsRoot, { recursive: true });
    const directory = await fs.mkdtemp(path.join(snapshotsRoot, 'migration-'));
    await backup(oldServer.store.db, path.join(directory, 'library.sqlite'));
    const count = oldServer.store.db.prepare('SELECT COUNT(*) n FROM assets').get().n;
    await fs.writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({ complete: true, metadataOnly: true, assets: count }),
    );
    try {
      await restoreBackup({
        backupDir: directory,
        sourceMediaDir: path.join(source, 'media'),
        dataDir: path.join(dest, 'database'),
        mediaDir: path.join(dest, 'media'),
      });
      nextServer = await this.start(dest);
      if (nextServer.store.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
        throw new Error('新库数据库校验失败');
      // Commit the path only after every original has been hash verified and the new DB opens.
      await this.writeConfig(dest);
      this.server = nextServer;
      this.root = dest;
    } catch (error) {
      if (nextServer) await nextServer.close();
      // Keep failed copies for diagnosis rather than deleting any user-selected directory.
      throw new Error(`迁移未切换，继续使用旧库。${error.message}。目标中的未完成副本可手动清理。`);
    }
    await oldServer.close();
    return { root: dest, oldRoot, count };
  }
  async waitForMigration() {
    if (this.migration) await this.migration.catch(() => {});
  }
  async close() {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }
}
module.exports = { LocalLibrary, inside };
