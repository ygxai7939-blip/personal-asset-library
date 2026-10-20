const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scanImports } = require('../desktop/scan-imports.cjs');
test('folder scan includes nested media, preserves folders, skips links and non-media, and limits counts', async () => {
  const root = await fs.mkdtemp(path.join(__dirname, '.scan-'));
  try {
    const folder = path.join(root, '公区娱乐区'),
      sub = path.join(folder, '一层', '二层');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(folder, 'a.PNG'), 'a');
    await fs.writeFile(path.join(sub, 'b.mp4'), 'b');
    await fs.writeFile(path.join(sub, '说明.txt'), 'text');
    const outside = path.join(root, '其他');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'private.png'), 'outside');
    await fs.symlink(outside, path.join(folder, '链接'), 'junction');
    const found = await scanImports([folder, path.join(folder, 'a.PNG')]);
    assert.equal(found.files.length, 2);
    assert.deepEqual(found.files.find((f) => f.name === 'b.mp4').folders, [
      '公区娱乐区',
      '一层',
      '二层',
    ]);
    assert.equal(found.skipped, 2);
    assert.equal(found.warnings.length, 0);
    await assert.rejects(scanImports([folder], { maxFiles: 1 }), /最多/);
    const missing = await scanImports([path.join(root, '不存在')]);
    assert.equal(missing.files.length, 0);
    assert.equal(missing.warnings.length, 1);
  } finally {
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  }
});
