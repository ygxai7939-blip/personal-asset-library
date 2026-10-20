'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200)
    throw new Error('密码需为 8–200 个字符');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(scryptSync(String(password), salt, 64), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();

function openStore(dataDir, mediaDir) {
  if (/^(\\\\|\/\/)/.test(dataDir)) throw new Error('数据库必须放服务电脑本地，不能放网络共享路径');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'library.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), disabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES categories(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, original_name TEXT NOT NULL, extension TEXT NOT NULL, mime TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER, height INTEGER, duration REAL, description TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5), thumb_status TEXT NOT NULL DEFAULT 'pending', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, deleted_by TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS asset_tags (asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id), PRIMARY KEY(asset_id,tag_id));
    CREATE TABLE IF NOT EXISTS asset_categories (asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, category_id TEXT NOT NULL REFERENCES categories(id), PRIMARY KEY(asset_id,category_id));
    CREATE INDEX IF NOT EXISTS assets_created ON assets(deleted_at,created_at);
    CREATE INDEX IF NOT EXISTS asset_categories_category ON asset_categories(category_id,asset_id);
    CREATE INDEX IF NOT EXISTS asset_tags_tag ON asset_tags(tag_id,asset_id);
    CREATE INDEX IF NOT EXISTS assets_kind ON assets(kind,rating);
  `);
  db.exec(
    "CREATE TABLE IF NOT EXISTS category_styles (category_id TEXT PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE, icon TEXT NOT NULL DEFAULT 'folder', color TEXT NOT NULL DEFAULT '')",
  );
  const recorded = db.prepare('SELECT value FROM settings WHERE key=?').get('mediaDir');
  const resolvedMedia = path.resolve(mediaDir);
  if (recorded && path.resolve(recorded.value).toLowerCase() !== resolvedMedia.toLowerCase()) {
    db.close();
    throw new Error('此数据库已经绑定其他素材目录。请使用原目录；迁移需先备份，不能直接切换。');
  }
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('mediaDir', resolvedMedia);
  function tx(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function addUser(name, displayName, password, role = 'member') {
    name = String(name || '').trim();
    displayName = String(displayName || name).trim();
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(name))
      throw new Error('账号使用 2–40 位字母、数字、点、短横线或下划线');
    if (!displayName || displayName.length > 50) throw new Error('姓名需为 1–50 个字符');
    const user = {
      id: randomUUID(),
      name,
      display_name: displayName,
      role: role === 'admin' ? 'admin' : 'member',
    };
    db.prepare('INSERT INTO users(id,name,display_name,password,role) VALUES(?,?,?,?,?)').run(
      user.id,
      user.name,
      user.display_name,
      passwordHash(password),
      user.role,
    );
    return user;
  }
  function bootstrap(name, displayName, password) {
    if (db.prepare('SELECT COUNT(*) n FROM users').get().n)
      throw new Error('已建立管理员，请登录现有账号');
    return tx(() => {
      const user = addUser(name, displayName, password, 'admin');
      for (const [parent, children] of Object.entries({
        灵感参考: ['住宅空间', '商业空间', '办公空间', '酒店与民宿'],
        材料与细节: ['木作与饰面', '石材与瓷砖', '节点与收口'],
        家具与软装: ['家具', '灯具', '艺术品与陈设'],
        表达与提案: ['排版参考', '色彩搭配'],
        学习资料: ['施工工艺'],
      })) {
        const id = randomUUID();
        db.prepare('INSERT INTO categories VALUES(?,?,NULL,?)').run(id, parent, now());
        for (const name of children)
          db.prepare('INSERT INTO categories VALUES(?,?,?,?)').run(randomUUID(), name, id, now());
      }
      return user;
    });
  }
  function login(name, password) {
    const user = db.prepare('SELECT * FROM users WHERE name=? AND disabled=0').get(String(name));
    if (!user || !passwordMatches(password, user.password)) return null;
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      digest(token),
      user.id,
      new Date(Date.now() + 7 * 86400000).toISOString(),
    );
    return {
      token,
      user: { id: user.id, name: user.name, display_name: user.display_name, role: user.role },
    };
  }
  function userForToken(token) {
    return db
      .prepare(
        'SELECT u.id,u.name,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.disabled=0',
      )
      .get(digest(token || ''), now());
  }
  function categories() {
    return db
      .prepare(
        `WITH RECURSIVE tree(root,id) AS (SELECT id,id FROM categories UNION ALL SELECT t.root,c.id FROM tree t JOIN categories c ON c.parent_id=t.id)
      SELECT c.*, (SELECT COUNT(DISTINCT a.id) FROM tree t JOIN asset_categories ac ON ac.category_id=t.id JOIN assets a ON a.id=ac.asset_id WHERE t.root=c.id AND a.deleted_at IS NULL) count FROM categories c ORDER BY c.created_at,c.name`,
      )
      .all()
      .map((c) => ({
        ...c,
        ...db.prepare('SELECT icon,color FROM category_styles WHERE category_id=?').get(c.id),
      }));
  }
  const assetSelect = `SELECT a.*, u.display_name uploaded_by,
    COALESCE((SELECT json_group_array(json_object('id',t.id,'name',t.name)) FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id),'[]') tags,
    COALESCE((SELECT json_group_array(json_object('id',c.id,'name',c.name)) FROM asset_categories ac JOIN categories c ON c.id=ac.category_id WHERE ac.asset_id=a.id),'[]') categories
    FROM assets a JOIN users u ON u.id=a.created_by`;
  const parseAsset = (a) =>
    a ? { ...a, tags: JSON.parse(a.tags), categories: JSON.parse(a.categories) } : null;
  function getAsset(id) {
    return parseAsset(db.prepare(`${assetSelect} WHERE a.id=?`).get(id));
  }
  function listAssets(query) {
    const values = [],
      conditions = [query.view === 'trash' ? 'a.deleted_at IS NOT NULL' : 'a.deleted_at IS NULL'];
    if (query.view === 'unfiled')
      conditions.push('NOT EXISTS (SELECT 1 FROM asset_categories ac WHERE ac.asset_id=a.id)');
    if (query.view === 'untagged')
      conditions.push('NOT EXISTS (SELECT 1 FROM asset_tags at WHERE at.asset_id=a.id)');
    if (query.q) {
      conditions.push(
        `(a.name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id AND t.name LIKE ? ESCAPE '\\'))`,
      );
      const q = `%${String(query.q)
        .slice(0, 200)
        .replace(/[\\%_]/g, '\\$&')}%`;
      values.push(q, q, q);
    }
    if (query.category) {
      conditions.push(
        'a.id IN (WITH RECURSIVE sub(id) AS (SELECT id FROM categories WHERE id=? UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id=sub.id) SELECT asset_id FROM asset_categories WHERE category_id IN (SELECT id FROM sub))',
      );
      values.push(query.category);
    }
    if (query.tag) {
      conditions.push('EXISTS(SELECT 1 FROM asset_tags at WHERE at.asset_id=a.id AND at.tag_id=?)');
      values.push(query.tag);
    }
    if (['image', 'video'].includes(query.kind)) {
      conditions.push('a.kind=?');
      values.push(query.kind);
    }
    if (query.rating && /^[1-5]$/.test(query.rating)) {
      conditions.push('a.rating>=?');
      values.push(Number(query.rating));
    }
    const where = ` WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) n FROM assets a${where}`).get(...values).n;
    const order =
      {
        newest: 'a.created_at DESC,a.id',
        oldest: 'a.created_at ASC,a.id',
        name: 'a.name COLLATE NOCASE,a.id',
        rating: 'a.rating DESC,a.created_at DESC,a.id',
      }[query.sort] || 'a.created_at DESC,a.id';
    const offset = Math.max(0, Number.parseInt(query.offset) || 0),
      limit = Math.min(120, Math.max(1, Number.parseInt(query.limit) || 90));
    const items = db
      .prepare(`${assetSelect}${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...values, limit, offset)
      .map(parseAsset);
    return { items, total, offset, limit };
  }
  function stats() {
    return db
      .prepare(
        `SELECT COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) total, COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) trash,
      COUNT(CASE WHEN deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM asset_categories ac WHERE ac.asset_id=assets.id) THEN 1 END) unfiled,
      COUNT(CASE WHEN deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM asset_tags at WHERE at.asset_id=assets.id) THEN 1 END) untagged,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN size ELSE 0 END),0) bytes FROM assets`,
      )
      .get();
  }
  function addRelations(ids, categoryIds = [], tagNames = []) {
    for (const categoryId of categoryIds) {
      if (!db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId))
        throw new Error('分类不存在，请刷新');
      for (const id of ids)
        db.prepare('INSERT OR IGNORE INTO asset_categories VALUES(?,?)').run(id, categoryId);
    }
    for (const raw of tagNames) {
      const name = String(raw).trim();
      if (!name || name.length > 50) throw new Error('标签长度需为 1–50 个字符');
      db.prepare('INSERT OR IGNORE INTO tags VALUES(?,?)').run(randomUUID(), name);
      const tag = db.prepare('SELECT id FROM tags WHERE name=?').get(name);
      for (const id of ids)
        db.prepare('INSERT OR IGNORE INTO asset_tags VALUES(?,?)').run(id, tag.id);
    }
  }
  return {
    db,
    tx,
    bootstrap,
    addUser,
    login,
    userForToken,
    categories,
    getAsset,
    listAssets,
    stats,
    addRelations,
    close: () => db.close(),
  };
}
module.exports = { openStore, now, digest, passwordHash };
