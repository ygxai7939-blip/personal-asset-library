const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LocalLibrary } = require('../desktop/local-library.cjs');
test('folder moves reject cycles and duplicates; styles persist in an existing library', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '.folders-'));
  let lib = new LocalLibrary(path.join(root, 'config.json'), path.join(root, 'library'));
  const call = async (route, method = 'GET', body) => {
    let r = await fetch(lib.server.url + route, {
      method,
      headers: {
        Authorization: `Bearer ${lib.server.personalSession.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    await lib.init();
    const create = async (name, parent_id = null) =>
      (await call('/api/categories', 'POST', { name, parent_id })).data.id;
    const a = await create('A'),
      b = await create('B'),
      child = await create('子文件夹', a),
      leaf = await create('最下级', child);
    assert.equal((await call(`/api/categories/${a}`, 'PATCH', { parent_id: leaf })).status, 400);
    assert.equal((await call(`/api/categories/${a}`, 'PATCH', { parent_id: a })).status, 400);
    assert.equal(
      (await call(`/api/categories/${child}`, 'PATCH', { icon: 'house', color: '#72aef2' })).status,
      200,
    );
    assert.equal((await call(`/api/categories/${child}`, 'PATCH', { parent_id: b })).status, 200);
    await create('子文件夹', a);
    assert.equal((await call(`/api/categories/${child}`, 'PATCH', { parent_id: a })).status, 400);
    assert.equal((await call(`/api/categories/${child}`, 'PATCH', { color: 'red' })).status, 400);
    await lib.close();
    await lib.init();
    const item = (await call('/api/summary')).data.categories.find((c) => c.id === child);
    assert.equal(item.parent_id, b);
    assert.equal(item.icon, 'house');
    assert.equal(item.color, '#72aef2');
    assert.equal((await call(`/api/categories/${b}`, 'DELETE')).status, 200);
    assert.equal(
      lib.server.store.db
        .prepare('SELECT COUNT(*) n FROM category_styles WHERE category_id=?')
        .get(child).n,
      0,
    );
  } finally {
    await lib.close();
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  }
});
