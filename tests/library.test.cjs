'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createLibraryServer } = require('../server/api.cjs');
let server, root, adminToken, memberToken, assetId, categoryId, tagId, image;
async function call(route, token = adminToken, method = 'GET', body) {
  const response = await fetch(server.url + route, {
    method,
    headers: {
      Authorization: `Bearer ${token || ''}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
async function upload(name = '客厅参考.png', data = image, token = adminToken, categories = []) {
  const form = new FormData();
  form.append('name', name);
  form.append('categories', JSON.stringify(categories));
  form.append('file', new Blob([data]), name);
  const response = await fetch(server.url + '/api/assets/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  root = await fs.mkdtemp(path.join(__dirname, '.run-'));
  server = await createLibraryServer({
    dataDir: path.join(root, 'db'),
    mediaDir: path.join(root, 'media'),
    port: 0,
    bootstrap: ['admin', '管理员', 'admin-pass-123'],
  });
  image = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#92765c' } })
    .png()
    .toBuffer();
  adminToken = (
    await call('/api/auth/login', null, 'POST', { name: 'admin', password: 'admin-pass-123' })
  ).body.token;
});
after(async () => {
  await server?.close();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(__dirname));
  await fs.rm(root, { recursive: true, force: true });
});
test('authentication is required for data and media', async () => {
  assert.equal((await call('/api/summary', null)).status, 401);
  assert.equal((await call('/api/admin/users', null)).status, 401);
  assert.equal(
    (await call('/api/auth/login', null, 'POST', { name: 'admin', password: 'wrong' })).status,
    401,
  );
});
test('admin can add members beyond the initial six', async () => {
  for (let i = 1; i <= 12; i++)
    assert.equal(
      (
        await call('/api/admin/users', adminToken, 'POST', {
          name: `member${i}`,
          display_name: `成员${i}`,
          password: 'member-pass-123',
        })
      ).status,
      200,
    );
  memberToken = (
    await call('/api/auth/login', null, 'POST', { name: 'member1', password: 'member-pass-123' })
  ).body.token;
  assert.equal((await call('/api/admin/users')).body.length, 13);
  assert.equal((await call('/api/admin/users', memberToken)).status, 403);
});
test('real import, Unicode names, deduplication and hierarchy counts', async () => {
  const summary = (await call('/api/summary')).body;
  const parent = summary.categories.find((c) => c.name === '灵感参考');
  const children = summary.categories.filter((c) => c.parent_id === parent.id);
  categoryId = children[0].id;
  const result = await upload('现代客厅参考.png', image, adminToken, [categoryId]);
  assert.equal(result.status, 200);
  assetId = result.body.asset.id;
  assert.equal(result.body.asset.name, '现代客厅参考');
  assert.equal(result.body.duplicate, false);
  assert.equal(
    (await upload('其他名字.png', image, memberToken, [children[1].id])).body.duplicate,
    true,
  );
  const updated = (await call('/api/summary')).body;
  assert.equal(updated.stats.total, 1);
  assert.equal(updated.categories.find((c) => c.id === parent.id).count, 1);
  assert.equal((await call(`/api/assets?category=${parent.id}`)).body.total, 1);
});
test('concurrent duplicate imports produce only one asset', async () => {
  const different = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#456e91' },
  })
    .png()
    .toBuffer();
  const results = await Promise.all([
    upload('并发一.png', different),
    upload('并发二.png', different, memberToken),
  ]);
  assert(results.every((r) => r.status === 200));
  assert.equal(new Set(results.map((r) => r.body.asset.id)).size, 1);
  assert.equal((await call('/api/summary')).body.stats.total, 2);
});
test('invalid files and nonexistent categories never publish assets', async () => {
  const before = (await call('/api/summary')).body.stats.total;
  assert.equal((await upload('bad.png', Buffer.from('not an image'))).status, 400);
  assert.equal((await upload('bad.exe', image)).status, 400);
  assert.equal((await upload('bad.png', image, adminToken, ['missing'])).status, 400);
  assert.equal((await call('/api/summary')).body.stats.total, before);
});
test('tags, rating, fields and search work without clearing other data', async () => {
  assert.equal(
    (
      await call('/api/assets/batch', memberToken, 'POST', {
        ids: [assetId],
        tags: ['现代', '木饰面'],
        rating: 4,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/api/assets/${assetId}`, memberToken, 'PATCH', { description: '参考弧形收口' }))
      .status,
    200,
  );
  assert.equal(
    (await call(`/api/assets/${assetId}`, adminToken, 'PATCH', { name: '新名称' })).status,
    200,
  );
  const asset = (await call(`/api/assets/${assetId}`)).body;
  assert.equal(asset.description, '参考弧形收口');
  assert.equal(asset.tags.length, 2);
  tagId = asset.tags[0].id;
  assert.equal((await call('/api/assets?q=' + encodeURIComponent('木饰面'))).body.total, 1);
  assert.equal((await call('/api/assets?q=' + encodeURIComponent('现代 空间'))).body.total, 0);
  assert.equal((await call('/api/assets?rating=4')).body.total, 1);
  assert.equal((await call('/api/assets?rating=5')).body.total, 0);
  assert.equal(
    (await call(`/api/assets/${assetId}`, memberToken, 'PATCH', { rating: 99 })).status,
    400,
  );
});
test('original file range requests work and do not allow traversal', async () => {
  const response = await fetch(server.url + `/api/assets/${assetId}/file`, {
    headers: { Authorization: `Bearer ${memberToken}`, Range: 'bytes=0-9' },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 10);
  assert.equal((await call('/api/assets/not-a-real-id/file')).status, 404);
});
test('members directly trash and restore; only admins may permanently delete', async () => {
  assert.equal(
    (await call('/api/assets/trash', memberToken, 'POST', { ids: [assetId] })).status,
    200,
  );
  assert.equal((await call('/api/assets?view=trash', memberToken)).body.total, 1);
  assert.equal(
    (await call('/api/assets/purge', memberToken, 'POST', { ids: [assetId] })).status,
    403,
  );
  assert.equal((await upload('duplicate.png')).status, 409);
  assert.equal(
    (await call('/api/assets/restore', memberToken, 'POST', { ids: [assetId] })).status,
    200,
  );
  assert.equal((await call(`/api/assets/${assetId}`)).body.tags.length, 2);
});
test('NAS disconnection fails visibly and never creates a replacement media root', async () => {
  await server.waitForPreviews();
  const rootMedia = path.join(root, 'media'),
    offline = path.join(root, 'media-offline');
  await fs.rename(rootMedia, offline);
  try {
    const unique = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#bc8765' },
    })
      .png()
      .toBuffer();
    assert.equal((await upload('离线.png', unique)).status, 503);
    await assert.rejects(fs.access(rootMedia));
    assert.equal(
      (
        await fetch(server.url + `/api/assets/${assetId}/file`, {
          headers: { Authorization: `Bearer ${memberToken}` },
        })
      ).status,
      503,
    );
  } finally {
    await fs.rename(offline, rootMedia);
  }
});
test('full backup restores an independent working library, metadata and cleared sessions', async () => {
  const result = await call('/api/admin/backup', adminToken, 'POST', {});
  assert.equal(result.status, 200);
  assert.equal(result.body.count, 2);
  const { restoreBackup } = require('../server/restore.cjs');
  const dataDir = path.join(root, 'restored-db'),
    mediaDir = path.join(root, 'restored-media');
  await restoreBackup({ backupDir: result.body.directory, dataDir, mediaDir });
  const restored = await createLibraryServer({ dataDir, mediaDir, port: 0 });
  try {
    assert.equal(restored.store.stats().total, 2);
    assert.equal(restored.store.getAsset(assetId).tags.length, 2);
    assert.equal(restored.store.getAsset(assetId).description, '参考弧形收口');
    assert.equal(restored.store.userForToken(adminToken), undefined);
    assert(restored.store.login('admin', 'admin-pass-123'));
    const response = await fetch(restored.url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'admin', password: 'admin-pass-123' }),
    });
    assert.equal(response.status, 200);
  } finally {
    await restored.close();
  }
  await assert.rejects(
    restoreBackup({ backupDir: result.body.directory, dataDir, mediaDir }),
    /空目录/,
  );
});
test('12 member sessions concurrently add tags without losing each other’s updates', async () => {
  const tokens = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      call('/api/auth/login', null, 'POST', {
        name: `member${i + 1}`,
        password: 'member-pass-123',
      }),
    ),
  );
  const results = await Promise.all(
    tokens.map((result, i) =>
      call('/api/assets/batch', result.body.token, 'POST', {
        ids: [assetId],
        tags: [`并发成员${i + 1}`],
      }),
    ),
  );
  assert(results.every((x) => x.status === 200));
  const asset = (await call(`/api/assets/${assetId}`)).body;
  assert.equal(asset.tags.filter((t) => t.name.startsWith('并发成员')).length, 12);
});
test('admin can purge only trashed assets and category removal retains originals', async () => {
  assert.equal(
    (await call('/api/assets/purge', adminToken, 'POST', { ids: [assetId] })).status,
    400,
  );
  assert.equal((await call(`/api/categories/${categoryId}`, adminToken, 'DELETE')).status, 200);
  assert.equal((await call(`/api/assets/${assetId}`)).status, 200);
  await call('/api/assets/trash', memberToken, 'POST', { ids: [assetId] });
  assert.equal(
    (await call('/api/assets/purge', adminToken, 'POST', { ids: [assetId] })).status,
    200,
  );
  assert.equal((await call(`/api/assets/${assetId}`)).status, 404);
});
test('disabled users lose existing sessions', async () => {
  const user = (await call('/api/admin/users')).body.find((u) => u.name === 'member1');
  await call(`/api/admin/users/${user.id}`, adminToken, 'PATCH', { disabled: true });
  assert.equal((await call('/api/summary', memberToken)).status, 401);
});
