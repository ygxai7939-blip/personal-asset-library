const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { LocalLibrary } = require('../desktop/local-library.cjs');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/quick-selection');
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
    await page.getByRole('button', { name: /^全部素材/ }).click();
    const normal = page.getByRole('toolbar', { name: '素材选择操作' });
    await normal.getByText('已选 0 / 205 项', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 120);
    const cards = page.locator('.asset-card');
    await cards.nth(0).click();
    await cards.nth(1).click({ modifiers: ['Control'] });
    assert.equal(await page.locator('.asset-card.selected').count(), 2);
    await cards.nth(0).click({ modifiers: ['Control'] });
    assert.equal(await page.locator('.asset-card.selected').count(), 1);
    await cards.nth(2).click();
    assert.equal(await page.locator('.asset-card.selected').count(), 1);
    assert.equal(await cards.nth(2).getAttribute('data-selected'), 'true');
    await normal.getByRole('button', { name: '全部取消', exact: true }).click();
    await page.evaluate(() => {
      for (const card of [...document.querySelectorAll('.asset-card')].slice(0, 3))
        card.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
    });
    await normal.getByText('已选 3 / 205 项', { exact: true }).waitFor();
    await normal.getByRole('button', { name: '全部取消', exact: true }).click();
    await normal.getByText('已选 0 / 205 项', { exact: true }).waitFor();
    await normal.getByRole('button', { name: '全部选择', exact: true }).click();
    await normal.getByText('已选 205 / 205 项', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(qa, 'normal-all-selected.png') });
    await page.locator('.batchbar').getByRole('button', { name: '评分', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '5 星', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '保存评分', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const rated = await page.evaluate(() => window.library.request('/api/assets?rating=5&limit=1'));
    assert.equal(rated.total, 205);
    await page.getByLabel('搜索素材', { exact: true }).fill('选择测试20');
    await normal.getByText('已选 0 / 6 项', { exact: true }).waitFor();
    await normal.getByRole('button', { name: '全部选择', exact: true }).click();
    await normal.getByText('已选 6 / 6 项', { exact: true }).waitFor();
    await page.getByLabel('搜索素材', { exact: true }).fill('');
    await normal.getByText('已选 0 / 205 项', { exact: true }).waitFor();
    await normal.getByRole('button', { name: '全部选择', exact: true }).click();
    await normal.getByText('已选 205 / 205 项', { exact: true }).waitFor();
    await page
      .locator('.batchbar')
      .getByRole('button', { name: '移入回收站', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
    await normal.getByText('已选 0 / 0 项', { exact: true }).waitFor();
    const after = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(after.stats.trash, 205);
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
            'normal gallery select all includes unloaded items',
            'Ctrl left click appends and toggles; ordinary click remains single select',
            'rapid consecutive Ctrl clicks preserve all selections',
            'search-filtered select all respects current results',
            'rating and trash actions split over 200 items',
          ],
          fixture: 'metadata-only, no purge',
        },
        null,
        2,
      ),
    );
    console.log('Quick selection checks passed');
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
