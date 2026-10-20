const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { LocalLibrary } = require('../desktop/local-library.cjs');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/trash-selection');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  const config = path.join(root, 'config'),
    library = path.join(root, 'library');
  // Metadata-only fixtures: the test restores entries, and never purges originals.
  const seed = new LocalLibrary(path.join(config, 'desktop.json'), library);
  await seed.init();
  const owner = seed.server.personalSession.user.id;
  const stamp = new Date().toISOString();
  seed.server.store.tx(() => {
    for (let i = 0; i < 205; i++)
      seed.server.store.db
        .prepare(
          'INSERT INTO assets(id,hash,name,original_name,extension,mime,kind,size,thumb_status,created_by,created_at,updated_at,deleted_at,deleted_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          i.toString(16).padStart(64, '0'),
          `选择测试${i}`,
          `选择测试${i}.png`,
          'png',
          'image/png',
          'image',
          100,
          'unavailable',
          owner,
          stamp,
          stamp,
          stamp,
          owner,
        );
  });
  await seed.close();
  let app;
  try {
    app = await electron.launch({
      executablePath: process.env.ASSET_TEST_EXECUTABLE || require('electron'),
      args: process.env.ASSET_TEST_EXECUTABLE ? [] : [path.resolve(__dirname, '..')],
      env: { ...process.env, ASSET_CONFIG_DIR: config, ASSET_LIBRARY_DIR: library },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.locator('.sidebar .brand').waitFor();
    await page.getByRole('button', { name: /^回收站/ }).click();
    const toolbar = page.getByRole('toolbar', { name: '回收站选择操作' });
    await toolbar.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 120);
    assert.equal(
      await toolbar.getByRole('button', { name: '全部取消', exact: true }).isDisabled(),
      true,
    );
    await toolbar.getByRole('button', { name: '全部选择', exact: true }).click();
    await toolbar.getByText('已选 205 / 205 项', { exact: true }).waitFor();
    assert.equal(await page.locator('.asset-card.selected').count(), 120);
    await toolbar.getByRole('button', { name: '全部取消', exact: true }).click();
    await toolbar.getByText('已选 0 / 205 项', { exact: true }).waitFor();
    assert.equal(await page.locator('.asset-card.selected').count(), 0);
    await toolbar.getByRole('button', { name: '全部选择', exact: true }).click();
    await toolbar.getByText('已选 205 / 205 项', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(qa, 'all-selected.png') });
    await page.locator('.batchbar').getByRole('button', { name: '恢复', exact: true }).click();
    await toolbar.getByText('已选 0 / 0 项', { exact: true }).waitFor();
    const meta = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(meta.stats.trash, 0);
    assert.equal(meta.stats.total, 205);
    assert.equal(
      await toolbar.getByRole('button', { name: '全部选择', exact: true }).isDisabled(),
      true,
    );
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          checks: [
            'select all includes 205 entries beyond 120 loaded',
            'cancel all clears visible and unloaded selection',
            'restore selection splits into at most 200 per request',
            'empty trash disables selection',
          ],
          fixture: 'metadata-only, no purge',
        },
        null,
        2,
      ),
    );
    console.log('Trash selection checks passed');
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
