const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { LocalLibrary } = require('../desktop/local-library.cjs');
test('personal library: private session, arbitrary folders, safe deletion, migration and restart', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '.personal-'));
  let lib = new LocalLibrary(path.join(root, 'config', 'desktop.json'), path.join(root, 'first'));
  const call = async (route, method = 'GET', body) => {
    const response = await fetch(lib.server.url + route, {
      method,
      headers: {
        Authorization: `Bearer ${lib.server.personalSession.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  try {
    await lib.init();
    assert.equal(lib.server.httpServer.address().address, '127.0.0.1');
    assert.equal((await fetch(lib.server.url + '/api/summary')).status, 401);
    assert.equal((await fetch(lib.server.url + '/api/auth/login', { method: 'POST' })).status, 404);
    assert.equal((await fetch(lib.server.url + '/api/admin/users')).status, 404);
    assert.equal((await call('/api/summary')).categories.length, 0);
    let parent = null,
      top,
      leaf;
    for (let i = 0; i < 6; i++) {
      leaf = (await call('/api/categories', 'POST', { name: `层级${i}`, parent_id: parent })).id;
      top ||= leaf;
      parent = leaf;
    }
    const survivor = (await call('/api/categories', 'POST', { name: '保留分类' })).id;
    await call(`/api/categories/${leaf}`, 'PATCH', { name: '最下级' });
    const form = new FormData();
    form.append('name', '测试原图.png');
    form.append('categories', JSON.stringify([leaf, survivor]));
    form.append(
      'file',
      new Blob([
        await sharp({ create: { width: 80, height: 120, channels: 3, background: '#9faacc' } })
          .png()
          .toBuffer(),
      ]),
      '测试原图.png',
    );
    const response = await fetch(lib.server.url + '/api/assets/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lib.server.personalSession.token}` },
      body: form,
    });
    assert.equal(response.status, 200);
    const imported = await response.json();
    const assetId = (await call('/api/assets')).items[0].id;
    await call(`/api/assets/${assetId}`, 'PATCH', { description: '迁移不能丢失', rating: 4 });
    await call('/api/assets/batch', 'POST', { ids: [assetId], tags: ['迁移测试'] });
    assert.equal((await call(`/api/categories/${top}`, 'DELETE')).removed, 6);
    const retained = await call(`/api/assets/${assetId}`);
    assert.equal(retained.categories.length, 1);
    assert.equal(retained.categories[0].id, survivor);
    assert.equal((await call('/api/assets')).total, 1);
    await assert.rejects(lib.migrate(path.join(root, 'first')), /不能/);
    const occupied = path.join(root, 'occupied');
    await fs.mkdir(occupied);
    await fs.writeFile(path.join(occupied, 'keep.txt'), 'keep');
    await assert.rejects(lib.migrate(occupied), /空文件夹/);
    assert.equal(await fs.readFile(path.join(occupied, 'keep.txt'), 'utf8'), 'keep');
    const failed = path.join(root, 'failed');
    await fs.mkdir(failed);
    const save = lib.writeConfig.bind(lib);
    lib.writeConfig = async () => {
      throw new Error('模拟配置写入失败');
    };
    await assert.rejects(lib.migrate(failed), /继续使用旧库/);
    lib.writeConfig = save;
    assert.equal(lib.root, path.join(root, 'first'));
    assert.equal((await call('/api/assets')).total, 1);
    assert.equal(JSON.parse(await fs.readFile(lib.configPath, 'utf8')).root, lib.root);
    const destination = path.join(root, 'migrated');
    await fs.mkdir(destination);
    const oldRoot = lib.root;
    const oldToken = lib.server.personalSession.token;
    const migrated = await lib.migrate(destination);
    assert.equal(migrated.count, 1);
    assert.equal(lib.root, destination);
    assert.notEqual(lib.server.personalSession.token, oldToken);
    await fs.access(path.join(oldRoot, 'database', 'library.sqlite'));
    const updated = await call(`/api/assets/${assetId}`);
    assert.equal(updated.description, '迁移不能丢失');
    assert.equal(updated.rating, 4);
    assert.equal(updated.tags[0].name, '迁移测试');
    await lib.server.waitForPreviews();
    assert.equal(
      (
        await fetch(lib.server.url + `/api/assets/${assetId}/file`, {
          headers: { Authorization: `Bearer ${lib.server.personalSession.token}` },
        })
      ).status,
      200,
    );
    await lib.close();
    lib = new LocalLibrary(
      path.join(root, 'config', 'desktop.json'),
      path.join(root, 'unused-default'),
    );
    await lib.init();
    assert.equal(lib.root, destination);
    assert.equal((await call('/api/assets')).total, 1);
    await lib.close();
    await fs.rename(destination, path.join(root, 'disconnected'));
    await assert.rejects(lib.init(), /原素材库无法访问/);
    await assert.rejects(fs.access(destination));
  } finally {
    await lib.close();
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  }
});
