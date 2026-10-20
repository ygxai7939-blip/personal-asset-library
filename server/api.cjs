'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { backup } = require('node:sqlite');
const { openStore, now, digest, passwordHash } = require('./store.cjs');
const { importFile, createPreviewQueue, objectPath, thumbPath } = require('./media.cjs');
const { version: APP_VERSION } = require('../package.json');

// Case-insensitive because Windows paths are; equal paths count as nested.
function nested(parent, child) {
  const relative = path.relative(
    path.resolve(parent).toLowerCase(),
    path.resolve(child).toLowerCase(),
  );
  // Compare whole path segments: a child named "..media" is still inside the parent.
  return (
    !relative ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}
async function createLibraryServer(options) {
  const { dataDir, mediaDir } = options;
  const host = options.personalOnly ? '127.0.0.1' : options.host || '127.0.0.1';
  const port = options.personalOnly ? 0 : (options.port ?? 47821);
  if (!dataDir || !mediaDir) throw new Error('数据库目录与素材目录需分别设置');
  if (nested(dataDir, mediaDir) || nested(mediaDir, dataDir))
    throw new Error('数据库目录与素材目录需分别设置，且不能互相包含');
  await fsp.mkdir(dataDir, { recursive: true });
  // Never create directories on a disconnected remote share. Existing inaccessible roots must fail visibly.
  await fsp.mkdir(mediaDir, { recursive: true });
  const probe = path.join(mediaDir, `.asset-write-${randomUUID()}`);
  await fsp.writeFile(probe, 'write-check', { flag: 'wx' });
  await fsp.rm(probe);
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'thumbs'), { recursive: true });
  const store = openStore(dataDir, mediaDir),
    queue = createPreviewQueue(store, options);
  const markerPath = path.join(mediaDir, '.asset-asset-library');
  let libraryId = store.db.prepare("SELECT value FROM settings WHERE key='libraryId'").get()?.value;
  if (!libraryId) {
    libraryId = randomUUID();
    store.db.prepare('INSERT INTO settings VALUES(?,?)').run('libraryId', libraryId);
  }
  try {
    const marker = await fsp.readFile(markerPath, 'utf8');
    if (marker !== libraryId) throw new Error('所选目录属于另一个素材库，请勿混用');
  } catch (error) {
    if (error.code === 'ENOENT' && !store.db.prepare('SELECT COUNT(*) n FROM assets').get().n)
      await fsp.writeFile(markerPath, libraryId, { flag: 'wx' });
    else {
      store.close();
      throw error;
    }
  }
  const requireStorage = async () => {
    let marker;
    try {
      marker = await fsp.readFile(markerPath, 'utf8');
    } catch {
      throw Object.assign(new Error('素材根目录暂不可访问，已停止写入，请检查 NAS'), {
        status: 503,
      });
    }
    if (marker !== libraryId) throw new Error('素材库目录校验失败，已停止写入');
  };
  if (options.bootstrap && !store.db.prepare('SELECT COUNT(*) n FROM users').get().n)
    store.bootstrap(...options.bootstrap);
  let personalSession;
  if (options.personalOnly) {
    let owner = store.db
      .prepare("SELECT id,name,display_name,role FROM users WHERE name='local-owner'")
      .get();
    if (!owner)
      owner = store.addUser(
        'local-owner',
        '个人素材库',
        require('node:crypto').randomBytes(32).toString('hex'),
        'admin',
      );
    const sessionToken = require('node:crypto').randomBytes(32).toString('hex');
    store.db.exec('DELETE FROM sessions');
    store.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(digest(sessionToken), owner.id, '9999-12-31T00:00:00.000Z');
    personalSession = { token: sessionToken, user: owner };
  }
  const app = express();
  if (options.personalOnly)
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin/users'))
        return res.status(404).json({ error: '个人版不提供账号功能' });
      next();
    });
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  let maintenance = false,
    activeImports = 0;
  const attempts = new Map();
  app.get('/api/health', (req, res) =>
    res.json({
      name: '素材库',
      version: APP_VERSION,
      setup: store.db.prepare('SELECT COUNT(*) n FROM users').get().n > 0,
    }),
  );
  app.post('/api/auth/login', (req, res) => {
    const ip = req.socket.remoteAddress,
      entry = attempts.get(ip) || { count: 0, until: Date.now() + 900000 };
    if (Date.now() > entry.until) {
      entry.count = 0;
      entry.until = Date.now() + 900000;
    }
    if (entry.count >= 15) return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    const result = store.login(req.body?.name, req.body?.password);
    if (!result) {
      entry.count++;
      attempts.set(ip, entry);
      return res.status(401).json({ error: '账号或密码不正确' });
    }
    attempts.delete(ip);
    res.json(result);
  });
  app.use('/api', (req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '');
    req.user = match && store.userForToken(match[1]);
    if (!req.user) return res.status(401).json({ error: '登录已过期，请重新登录' });
    if (maintenance && !['GET', 'HEAD'].includes(req.method))
      return res.status(503).json({ error: '备份维护中，请稍后重试' });
    next();
  });
  const admin = (req, res, next) =>
    req.user.role === 'admin' ? next() : res.status(403).json({ error: '仅管理员可以执行此操作' });
  const idsFrom = (body) => {
    const ids = body.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 200 ||
      ids.some((id) => typeof id !== 'string')
    )
      throw new Error('请选择 1–200 个素材');
    return [...new Set(ids)];
  };
  const live = (id) => {
    const asset = store.getAsset(id);
    if (!asset || asset.deleted_at)
      throw Object.assign(new Error('素材不存在或已进入回收站'), { status: 404 });
    return asset;
  };
  const strings = (value) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 50 || value.some((x) => typeof x !== 'string'))
      throw new Error('分类或标签格式不正确');
    return value;
  };
  const ratingFrom = (value) => {
    if (!Number.isInteger(value) || value < 0 || value > 5) throw new Error('评分必须为 0–5');
    return value;
  };
  app.get('/api/auth/me', (req, res) => res.json(req.user));
  app.post('/api/auth/logout', (req, res) => {
    store.db
      .prepare('DELETE FROM sessions WHERE hash=?')
      .run(digest(req.get('Authorization').slice(7)));
    res.json({ ok: true });
  });
  app.post('/api/auth/password', (req, res) => {
    const match = store.login(req.user.name, req.body.currentPassword);
    if (!match) return res.status(400).json({ error: '原密码不正确' });
    store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(match.token));
    const hash = passwordHash(req.body.password);
    store.tx(() => {
      store.db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.user.id);
      store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    });
    res.json({ ok: true, relogin: true });
  });
  app.get('/api/summary', (req, res) =>
    res.json({
      stats: store.stats(),
      categories: store.categories(),
      tags: store.db
        .prepare(
          `SELECT t.*,COUNT(a.id) count FROM tags t LEFT JOIN asset_tags at ON at.tag_id=t.id LEFT JOIN assets a ON a.id=at.asset_id AND a.deleted_at IS NULL GROUP BY t.id ORDER BY t.name`,
        )
        .all(),
    }),
  );
  app.get('/api/assets', (req, res) => res.json(store.listAssets(req.query)));
  app.get('/api/assets/:id', (req, res) => {
    const asset = store.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: '素材不存在' });
    res.json(asset);
  });
  app.get('/api/assets/:id/file', async (req, res) => {
    const asset = store.getAsset(req.params.id);
    if (!asset || asset.deleted_at)
      return res.status(404).json({ error: '素材不存在或已移入回收站' });
    const file = objectPath(mediaDir, asset);
    try {
      await fsp.access(file);
    } catch {
      return res.status(503).json({ error: '原文件暂不可访问，请检查 NAS 连接或联系管理员' });
    }
    res.set('Content-Type', asset.mime);
    res.set('Cache-Control', 'private, no-store');
    if (req.query.download === '1') res.attachment(asset.original_name);
    // The validated storage root may contain a dot-prefixed directory (e.g. .qa).
    res.sendFile(file, { dotfiles: 'allow' }, (error) => {
      if (error && !res.headersSent) res.status(503).json({ error: '文件读取失败' });
    });
  });
  app.get('/api/assets/:id/thumb', async (req, res) => {
    const asset = store.getAsset(req.params.id);
    if (!asset) return res.sendStatus(404);
    const file = thumbPath(dataDir, asset);
    try {
      await fsp.access(file);
      res.type('jpg').sendFile(file, { dotfiles: 'allow' });
    } catch {
      res.sendStatus(404);
    }
  });
  const upload = multer({
    dest: path.join(dataDir, 'uploads'),
    limits: { fileSize: 2 * 1024 ** 3, files: 1, fields: 5, fieldSize: 8192 },
  });
  app.post('/api/assets/import', (req, res, next) => {
    activeImports++;
    upload.single('file')(req, res, (error) => {
      if (error) {
        activeImports--;
        next(error);
        return;
      }
      (async () => {
        if (!req.file) throw new Error('没有收到文件');
        try {
          await requireStorage();
          const categories = strings(JSON.parse(req.body.categories || '[]')),
            tags = strings(JSON.parse(req.body.tags || '[]'));
          // Fail early before writing any NAS objects if category references are invalid.
          for (const id of categories)
            if (!store.db.prepare('SELECT id FROM categories WHERE id=?').get(id))
              throw new Error('分类不存在，请刷新');
          const result = await importFile(store, req.file.path, {
            dataDir,
            mediaDir,
            user: req.user,
            name: req.body.name || Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            categories,
            tags,
          });
          queue.enqueue(result.asset.id);
          res.json(result);
        } finally {
          await fsp.rm(req.file.path, { force: true });
        }
      })()
        .catch(next)
        .finally(() => {
          activeImports--;
        });
    });
  });
  app.patch('/api/assets/:id', (req, res) => {
    live(req.params.id);
    const body = req.body;
    store.tx(() => {
      for (const key of ['name', 'description', 'source_url'])
        if (Object.hasOwn(body, key)) {
          if (
            typeof body[key] !== 'string' ||
            body[key].length > { name: 240, description: 6000, source_url: 2000 }[key] ||
            (key === 'name' && !body[key].trim())
          )
            throw new Error('名称、备注或来源格式不正确');
          if (key === 'source_url' && body[key] && !/^https?:\/\//i.test(body[key]))
            throw new Error('来源网址需以 http:// 或 https:// 开头');
          store.db
            .prepare(`UPDATE assets SET ${key}=?,updated_at=? WHERE id=?`)
            .run(body[key], now(), req.params.id);
        }
      if (Object.hasOwn(body, 'rating'))
        store.db
          .prepare('UPDATE assets SET rating=?,updated_at=? WHERE id=?')
          .run(ratingFrom(body.rating), now(), req.params.id);
    });
    res.json(store.getAsset(req.params.id));
  });
  app.post('/api/assets/batch', (req, res) => {
    const ids = idsFrom(req.body),
      categories = strings(req.body.categories),
      tags = strings(req.body.tags);
    store.tx(() => {
      ids.forEach(live);
      store.addRelations(ids, categories, tags);
      if (Object.hasOwn(req.body, 'rating'))
        for (const id of ids)
          store.db
            .prepare('UPDATE assets SET rating=?,updated_at=? WHERE id=?')
            .run(ratingFrom(req.body.rating), now(), id);
    });
    res.json({ ok: true, count: ids.length });
  });
  app.delete('/api/assets/:id/tags/:tag', (req, res) => {
    live(req.params.id);
    store.db
      .prepare('DELETE FROM asset_tags WHERE asset_id=? AND tag_id=?')
      .run(req.params.id, req.params.tag);
    res.json({ ok: true });
  });
  app.delete('/api/assets/:id/categories/:category', (req, res) => {
    live(req.params.id);
    store.db
      .prepare('DELETE FROM asset_categories WHERE asset_id=? AND category_id=?')
      .run(req.params.id, req.params.category);
    res.json({ ok: true });
  });
  app.post('/api/assets/trash', (req, res) => {
    const ids = idsFrom(req.body);
    store.tx(() => {
      for (const id of ids) {
        live(id);
        store.db
          .prepare('UPDATE assets SET deleted_at=?,deleted_by=?,updated_at=? WHERE id=?')
          .run(now(), req.user.id, now(), id);
      }
    });
    res.json({ ok: true });
  });
  app.post('/api/assets/restore', (req, res) => {
    const ids = idsFrom(req.body);
    store.tx(() => {
      for (const id of ids) {
        if (!store.getAsset(id)) throw new Error('素材不存在');
        store.db
          .prepare('UPDATE assets SET deleted_at=NULL,deleted_by=NULL,updated_at=? WHERE id=?')
          .run(now(), id);
      }
    });
    ids.forEach((id) => queue.enqueue(id));
    res.json({ ok: true });
  });
  app.post('/api/assets/purge', admin, async (req, res) => {
    if (activeImports) throw new Error('有文件正在导入，请稍后彻底删除');
    const ids = idsFrom(req.body);
    const assets = ids.map((id) => store.getAsset(id));
    if (assets.some((a) => !a?.deleted_at)) throw new Error('只能彻底删除回收站中的素材');
    maintenance = true;
    try {
      await requireStorage();
      for (const asset of assets) {
        // Retain the database entry if deleting the original fails (e.g. NAS offline).
        // An original that is already gone under a verified root must not block cleanup forever.
        await fsp.unlink(objectPath(mediaDir, asset)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
        store.db.prepare('DELETE FROM assets WHERE id=? AND deleted_at IS NOT NULL').run(asset.id);
        await fsp.rm(thumbPath(dataDir, asset), { force: true });
      }
      res.json({ ok: true });
    } finally {
      maintenance = false;
    }
  });
  app.post('/api/categories', admin, (req, res) => {
    const name = String(req.body.name || '').trim(),
      parent = req.body.parent_id || null;
    if (!name || name.length > 255) throw new Error('分类名称需为 1–255 个字符');
    if (parent && !store.db.prepare('SELECT id FROM categories WHERE id=?').get(parent))
      throw new Error('父分类不存在');
    if (
      store.db
        .prepare('SELECT id FROM categories WHERE name=? AND parent_id IS ?')
        .get(name, parent)
    )
      throw new Error('同级分类已存在');
    const id = randomUUID();
    store.db.prepare('INSERT INTO categories VALUES(?,?,?,?)').run(id, name, parent, now());
    res.json({ id });
  });
  app.patch('/api/categories/:id', admin, (req, res) => {
    const category = store.db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
    if (!category) throw new Error('文件夹不存在');
    const name = req.body.name === undefined ? category.name : String(req.body.name).trim();
    const parent =
      req.body.parent_id === undefined ? category.parent_id : req.body.parent_id || null;
    if (!name || name.length > 255) throw new Error('文件夹名称需为 1–255 个字符');
    if (parent && !store.db.prepare('SELECT id FROM categories WHERE id=?').get(parent))
      throw new Error('目标文件夹不存在');
    if (
      parent &&
      store.db
        .prepare(
          'WITH RECURSIVE branch(id) AS (SELECT id FROM categories WHERE id=? UNION ALL SELECT c.id FROM categories c JOIN branch b ON c.parent_id=b.id) SELECT id FROM branch WHERE id=?',
        )
        .get(category.id, parent)
    )
      throw new Error('不能移动到自身或下级文件夹');
    if (
      store.db
        .prepare('SELECT id FROM categories WHERE name=? AND parent_id IS ? AND id<>?')
        .get(name, parent, category.id)
    )
      throw new Error('同级名称重复');
    if (
      req.body.icon !== undefined &&
      (typeof req.body.icon !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(req.body.icon))
    )
      throw new Error('图标不正确');
    if (
      req.body.color !== undefined &&
      (typeof req.body.color !== 'string' || !/^($|#[0-9a-fA-F]{6})$/.test(req.body.color))
    )
      throw new Error('颜色不正确');
    store.tx(() => {
      store.db
        .prepare('UPDATE categories SET name=?,parent_id=? WHERE id=?')
        .run(name, parent, category.id);
      const previous = store.db
        .prepare('SELECT icon,color FROM category_styles WHERE category_id=?')
        .get(category.id) || { icon: 'folder', color: '' };
      store.db
        .prepare(
          'INSERT INTO category_styles(category_id,icon,color) VALUES(?,?,?) ON CONFLICT(category_id) DO UPDATE SET icon=excluded.icon,color=excluded.color',
        )
        .run(category.id, req.body.icon ?? previous.icon, req.body.color ?? previous.color);
    });
    res.json({ ok: true });
  });
  app.delete('/api/categories/:id', admin, (req, res) => {
    const branch = store.db
      .prepare(
        'WITH RECURSIVE branch(id,depth) AS (SELECT id,0 FROM categories WHERE id=? UNION ALL SELECT c.id,b.depth+1 FROM categories c JOIN branch b ON c.parent_id=b.id) SELECT id FROM branch ORDER BY depth DESC',
      )
      .all(req.params.id);
    if (!branch.length) throw new Error('分类不存在');
    store.tx(() => {
      for (const { id } of branch) {
        store.db.prepare('DELETE FROM asset_categories WHERE category_id=?').run(id);
        store.db.prepare('DELETE FROM categories WHERE id=?').run(id);
      }
    });
    res.json({ ok: true, removed: branch.length });
  });
  app.get('/api/admin/users', admin, (req, res) =>
    res.json(
      store.db
        .prepare('SELECT id,name,display_name,role,disabled FROM users ORDER BY role,name')
        .all(),
    ),
  );
  app.post('/api/admin/users', admin, (req, res) =>
    res.json(store.addUser(req.body.name, req.body.display_name, req.body.password, 'member')),
  );
  app.patch('/api/admin/users/:id', admin, (req, res) => {
    const user = store.db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user || user.role === 'admin') throw new Error('此操作仅用于成员账号');
    store.tx(() => {
      if (Object.hasOwn(req.body, 'disabled'))
        store.db
          .prepare('UPDATE users SET disabled=? WHERE id=?')
          .run(req.body.disabled ? 1 : 0, user.id);
      if (req.body.password)
        store.db
          .prepare('UPDATE users SET password=? WHERE id=?')
          .run(passwordHash(req.body.password), user.id);
      store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/admin/storage', admin, async (req, res) => {
    let available = false;
    try {
      await fsp.access(mediaDir);
      available = true;
    } catch {}
    res.json({
      dataDir,
      mediaDir,
      available,
      backupsDir: path.join(dataDir, 'backups'),
      activeImports,
    });
  });
  app.post('/api/admin/backup', admin, async (req, res) => {
    if (activeImports) throw new Error('仍有文件正在导入，请完成后再备份');
    maintenance = true;
    const backupsRoot = path.join(dataDir, 'backups'),
      stamp = now().replace(/[:.]/g, '-');
    // Set only after mkdtemp has exclusively created a fresh directory for this request,
    // so cleanup can never touch a directory that existed before (e.g. a name collision).
    let staging = null,
      published = false;
    try {
      await requireStorage();
      await fsp.mkdir(backupsRoot, { recursive: true });
      staging = await fsp.mkdtemp(path.join(backupsRoot, `${stamp}.part-`));
      await backup(store.db, path.join(staging, 'library.sqlite'));
      const assets = store.db.prepare('SELECT * FROM assets').all();
      for (const asset of assets) {
        const dest = objectPath(staging, asset);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(objectPath(mediaDir, asset), dest).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
          throw new Error(`原文件缺失，备份未完成：${asset.original_name}`);
        });
      }
      await fsp.writeFile(
        path.join(staging, 'manifest.json'),
        JSON.stringify(
          { version: 1, created_at: now(), mediaDir, assets: assets.length, complete: true },
          null,
          2,
        ),
      );
      // Never publish over an existing backup; fall back to the unique staging suffix.
      let directory = path.join(backupsRoot, stamp);
      if (
        await fsp.stat(directory).then(
          () => true,
          () => false,
        )
      )
        directory = path.join(backupsRoot, `${stamp}-${path.basename(staging).split('.part-')[1]}`);
      await fsp.rename(staging, directory);
      published = true;
      res.json({ ok: true, directory, count: assets.length });
    } finally {
      // Clean up only our own unpublished staging directory, and only inside backupsRoot.
      // This covers handled errors only: a crash or power loss can still leave a "*.part-*"
      // directory, which should be treated as incomplete and removed by an administrator.
      if (staging && !published && path.dirname(staging) === backupsRoot)
        await fsp.rm(staging, { recursive: true, force: true }).catch((error) => {
          console.error(`备份暂存目录清理失败：${staging}：${error.message}`);
        });
      maintenance = false;
    }
  });

  app.use((error, req, res, next) => {
    if (req.file?.path) fsp.rm(req.file.path, { force: true }).catch(() => {});
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    const safe = /UNIQUE/.test(error.message)
      ? '名称或账号已存在'
      : error.code === 'LIMIT_FILE_SIZE'
        ? '单文件上限为 2 GB'
        : /^E[A-Z]+:/.test(error.message)
          ? '文件操作失败，请检查服务电脑或 NAS 连接、权限和空间'
          : error.message || '操作失败';
    res.status(status).json({ error: safe });
  });
  let httpServer;
  try {
    // Express 5 also invokes the listen callback with the error (e.g. EADDRINUSE).
    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(port, host, (error) => (error ? reject(error) : resolve(server)));
    });
  } catch (error) {
    await queue.stop();
    store.close();
    if (error.code === 'EADDRINUSE')
      throw new Error(`端口 ${port} 已被占用，请确认没有另一个素材库后台在运行`);
    throw error;
  }
  // Retry failed previews on start, e.g. after FFmpeg has been installed on the service computer.
  for (const asset of store.db
    .prepare(
      "SELECT id FROM assets WHERE thumb_status IN ('pending','unavailable') AND deleted_at IS NULL",
    )
    .all())
    queue.enqueue(asset.id);
  return {
    app,
    personalSession,
    store,
    httpServer,
    waitForPreviews: () => queue.idle(),
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${httpServer.address().port}`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve));
      await queue.stop();
      store.close();
    },
  };
}
module.exports = { createLibraryServer };
