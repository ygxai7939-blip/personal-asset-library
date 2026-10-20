const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/folder-drag');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  let app;
  try {
    app = await electron.launch({
      executablePath: process.env.ASSET_TEST_EXECUTABLE || require('electron'),
      args: process.env.ASSET_TEST_EXECUTABLE ? [] : [path.resolve(__dirname, '..')],
      env: {
        ...process.env,
        ASSET_CONFIG_DIR: path.join(root, 'config'),
        ASSET_LIBRARY_DIR: path.join(root, 'library'),
      },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.locator('.sidebar .brand').waitFor();
    const ids = await page.evaluate(async () => {
      const req = window.library.request;
      const a = await req('/api/categories', 'POST', { name: '源文件夹' }),
        b = await req('/api/categories', 'POST', { name: '目标文件夹' }),
        child = await req('/api/categories', 'POST', { name: '原子文件夹', parent_id: a.id });
      return { a: a.id, b: b.id, child: child.id };
    });
    await page.getByRole('button', { name: '刷新素材', exact: true }).click();
    await page.locator('.branched-menu__item[title="原子文件夹"]').click();
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(__dirname, 'fixtures/review/01.jpg'),
    );
    await page.getByRole('button', { name: '导入素材', exact: true }).click();
    await page.getByText('导入结果', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    const holdDrag = async (from, to, invalid = false) => {
      const source = await page.locator(`.branched-menu__item[title="${from}"]`).boundingBox();
      const dest = await page.locator(`.branched-menu__item[title="${to}"]`).boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(420);
      await page.locator('.folder-drag-ghost').waitFor();
      await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 12 });
      if (invalid) await page.getByText('不能移入自身或下级文件夹', { exact: true }).waitFor();
      else {
        await page.locator('.branched-menu__row[data-drop-target]').waitFor();
        await page.screenshot({ path: path.join(qa, 'drag-target.png') });
      }
      await page.mouse.up();
      await page.locator('.folder-drag-ghost').waitFor({ state: 'hidden' });
    };
    await holdDrag('源文件夹', '目标文件夹');
    await page.getByText('文件夹已移入目标文件夹', { exact: true }).waitFor();
    const meta = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(meta.categories.find((c) => c.id === ids.a).parent_id, ids.b);
    assert.equal(meta.categories.find((c) => c.id === ids.child).parent_id, ids.a);
    assert.equal(meta.categories.find((c) => c.id === ids.b).count, 1);
    const assets = await page.evaluate(() => window.library.request('/api/assets'));
    assert.equal(assets.total, 1);
    assert.equal(assets.items[0].categories[0].id, ids.child);
    await holdDrag('目标文件夹', '原子文件夹', true);
    const after = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(after.categories.find((c) => c.id === ids.b).parent_id, null);
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          checks: [
            'real pointer hold and move',
            'drop target highlight',
            'folder becomes child',
            'descendants and asset associations preserved',
            'cycle drop rejected',
          ],
        },
        null,
        2,
      ),
    );
    console.log('Folder long-press drag passed');
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
