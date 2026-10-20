const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/folder-import');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  const folder = path.join(root, '公区娱乐区');
  await fs.mkdir(path.join(folder, '一层', '二层'), { recursive: true });
  const big = path.join(folder, '100MB图片.png');
  await sharp({ create: { width: 120, height: 80, channels: 3, background: '#8899aa' } })
    .png()
    .toFile(big);
  await fs.truncate(big, 100 * 1024 * 1024);
  for (const [name, color] of [
    ['一层/参考.png', '#998877'],
    ['一层/二层/深层.png', '#779988'],
  ])
    await sharp({ create: { width: 100, height: 150, channels: 3, background: color } })
      .png()
      .toFile(path.join(folder, name));
  await fs.writeFile(path.join(folder, '说明.txt'), '不导入此文件');
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
    page.setDefaultTimeout(30000);
    await page.locator('.sidebar .brand').waitFor();
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.getByRole('button', { name: '导入文件夹', exact: true }).click();
    await page.getByText('导入结果', { exact: true }).waitFor({ timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 3);
    const meta = await page.evaluate(() => window.library.request('/api/summary'));
    const assets = await page.evaluate(() => window.library.request('/api/assets'));
    assert.equal(meta.categories.length, 3);
    assert.equal(
      meta.categories.find((c) => c.name === '一层').parent_id,
      meta.categories.find((c) => c.name === '公区娱乐区').id,
    );
    assert.equal(
      meta.categories.find((c) => c.name === '二层').parent_id,
      meta.categories.find((c) => c.name === '一层').id,
    );
    assert.equal(
      assets.items.find((a) => a.original_name === '100MB图片.png').size,
      100 * 1024 * 1024,
    );
    assert.equal(
      assets.items.find((a) => a.original_name === '深层.png').categories[0].id,
      meta.categories.find((c) => c.name === '二层').id,
    );
    assert.equal(await page.locator('.upload-panel .failed').count(), 0);
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    await page.getByRole('button', { name: '导入文件夹', exact: true }).click();
    await page.getByText('导入结果', { exact: true }).waitFor({ timeout: 120000 });
    const again = await page.evaluate(() => window.library.request('/api/summary'));
    assert.equal(again.categories.length, 3);
    assert.equal(again.stats.total, 3);
    await fs.access(big);
    await page.screenshot({ path: path.join(qa, 'folder-import.png') });
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          checks: [
            'recursive folder scan',
            'three levels preserved',
            '100 MiB real PNG file imported via native path',
            'non-media skipped',
            'reimport reuses categories and hashes',
            'source originals retained',
          ],
        },
        null,
        2,
      ),
    );
    console.log('Folder import and 100 MiB file passed');
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
