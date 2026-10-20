const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const appRoot = path.resolve(__dirname, '..');
(async () => {
  const qa = path.join(appRoot, '.qa', 'personal');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  const env = {
    ...process.env,
    ASSET_CONFIG_DIR: path.join(root, 'config'),
    ASSET_LIBRARY_DIR: path.join(root, 'library'),
  };
  const options = {
    executablePath: process.env.ASSET_TEST_EXECUTABLE || require('electron'),
    args: process.env.ASSET_TEST_EXECUTABLE ? [] : [appRoot],
    env,
    timeout: 60000,
  };
  let app, page;
  const errors = [];
  try {
    app = await electron.launch(options);
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => (errors.push(e.message), console.error('Renderer:', e.message)));
    await page.locator('.sidebar .brand').waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.equal(/LISHI|励时|团队|登录/.test(await page.locator('body').innerText()), false);
    assert.equal(await page.locator('.branched-menu__item').count(), 0);
    console.log('direct startup passed');
    const nameBox = () => page.getByLabel('文件夹名称', { exact: true });
    const folder = (name) =>
      page
        .locator('.branched-menu__item')
        .filter({ has: page.locator('.branched-menu__label').getByText(name, { exact: true }) });
    const createInline = async (name) => {
      await nameBox().fill(name);
      await nameBox().press('Enter');
      await page.locator('.branched-menu__item[title="' + name + '"]').waitFor();
    };
    const context = async (name) => {
      await page.locator('.branched-menu__item[title="' + name + '"]').click({ button: 'right' });
      await page.getByRole('menu', { name: '文件夹操作', exact: true }).waitFor();
    };
    await page.getByRole('button', { name: '新增文件夹', exact: true }).click();
    await createInline('我的灵感');
    await context('我的灵感');
    await page.getByRole('menuitem', { name: /新增子文件夹/ }).click();
    await createInline('建筑');
    await context('建筑');
    await page.getByRole('menuitem', { name: /新增子文件夹/ }).click();
    await createInline('住宅');
    await context('住宅');
    await page.getByRole('menuitem', { name: /重命名/ }).click();
    await createInline('住宅空间');
    await page.keyboard.press('Alt+n');
    await nameBox().press('Escape');
    assert.equal(
      (await page.evaluate(() => window.library.request('/api/summary'))).categories.length,
      3,
    );
    await context('住宅空间');
    await page.getByRole('menuitem', { name: /新增文件夹/ }).click();
    await createInline('横向参考');
    const siblings = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(
      siblings.categories.find((c) => c.name === '横向参考').parent_id,
      siblings.categories.find((c) => c.name === '住宅空间').parent_id,
    );
    await page
      .locator('.branched-menu__item[title="住宅空间"]')
      .dispatchEvent('contextmenu', { clientX: 1435, clientY: 916 });
    const rect = await page.getByRole('menu', { name: '文件夹操作', exact: true }).boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 1440 && rect.y + rect.height <= 920);
    await page.keyboard.press('Escape');
    await context('住宅空间');
    await page.getByRole('menuitem', { name: '文件夹图标', exact: true }).hover();
    await page.screenshot({ path: path.join(qa, '04-folder-menu.png') });
    await page.getByRole('button', { name: '图标：住宅', exact: true }).click();
    await context('住宅空间');
    await page.getByRole('menuitem', { name: '文件夹颜色', exact: true }).hover();
    await page.getByRole('button', { name: '颜色：蓝色', exact: true }).click();
    await context('住宅空间');
    await page.getByRole('menuitem', { name: '移动文件夹', exact: true }).click();
    await page.getByLabel('目标文件夹', { exact: true }).selectOption({ label: '我的灵感' });
    await page.getByRole('button', { name: '确认移动', exact: true }).click();
    await page
      .getByRole('dialog', { name: '移动文件夹', exact: true })
      .waitFor({ state: 'hidden' });
    const metadata = await page.evaluate(() => window.library.request('/api/summary'));
    const changed = metadata.categories.find((c) => c.name === '住宅空间');
    assert.equal(changed.icon, 'house');
    assert.equal(changed.color, '#72aef2');
    assert.equal(changed.parent_id, metadata.categories.find((c) => c.name === '我的灵感').id);
    await page.locator('.branched-menu__item[title="住宅空间"]').click();
    const files = [1, 2, 3].map((i) => path.join(__dirname, 'fixtures', 'review', `0${i}.jpg`));
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
    }, files);
    await page.getByRole('button', { name: '导入素材', exact: true }).click();
    await page.getByText('导入结果', { exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    await page.locator('.asset-card').first().waitFor();
    assert.equal(await page.locator('.asset-card').count(), 3);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.asset-card img').length === 3 &&
        [...document.querySelectorAll('.asset-card img')].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
    );
    await page.screenshot({ path: path.join(qa, '01-library.png') });
    console.log('categories and image import passed');
    await page.locator('.asset-card').first().dblclick();
    await page.locator('.preview-dock').waitFor();
    await page.screenshot({ path: path.join(qa, '02-preview.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '本地设置', exact: true }).click();
    const target = path.join(root, 'new-library');
    await fs.mkdir(target);
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, target);
    await page.getByRole('button', { name: '选择新的存储位置', exact: true }).click();
    await page.getByRole('button', { name: '确认迁移整个素材库', exact: true }).click();
    await page
      .getByText('迁移完成，已切换到新位置；旧库保留', { exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal((await page.evaluate(() => window.library.storageInfo())).root, target);
    await page.screenshot({ path: path.join(qa, '03-settings.png') });
    console.log('storage migration passed');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await context('我的灵感');
    await page.getByRole('menuitem', { name: /删除文件夹/ }).click();
    await page
      .getByRole('dialog', { name: '删除文件夹' })
      .getByRole('button', { name: '删除文件夹', exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('.branched-menu__item').length === 0,
    );
    assert.equal(await page.locator('.asset-card').count(), 3);
    await app.close();
    app = null;
    console.log('recursive folder deletion retained assets');
    app = await electron.launch(options);
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('.asset-card').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.asset-card').count(), 3);
    assert.equal((await page.evaluate(() => window.library.storageInfo())).root, target);
    assert.equal(await page.locator('.branched-menu__item').count(), 0);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          root,
          checks: [
            'no login or old brand',
            'inline folder creation, sibling creation, Escape cancel and three levels',
            'right-click menu and viewport edge positioning',
            'rename, move, custom icon and color',
            'real image import',
            'rounded preview',
            'UI storage migration',
            'recursive deletion retains originals',
            'restart persistence',
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log('Personal desktop checks passed', root);
  } catch (e) {
    if (page && !page.isClosed()) {
      console.error((await page.locator('body').innerText()).slice(-2500));
      await page.screenshot({ path: path.join(qa, 'failure.png') }).catch(() => {});
    }
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
