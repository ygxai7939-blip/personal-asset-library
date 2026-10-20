const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/thumbnail-loading');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  let app;
  const errors = [];
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
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.sidebar .brand').waitFor();
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(__dirname, 'fixtures/review/01.jpg'),
    );
    await page.getByRole('button', { name: '导入素材', exact: true }).click();
    await page.getByText('导入结果', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    await page.waitForFunction(() => document.querySelector('.asset-card img')?.naturalWidth > 0);
    await app.evaluate(({ net }) => {
      global.__pendingThumb = true;
      const original = global.fetch;
      global.fetch = async (input, init) => {
        const response = await original(input, init);
        if (global.__pendingThumb && String(input).includes('/api/assets?')) {
          const data = await response.clone().json();
          data.items = data.items.map((a) => ({ ...a, thumb_status: 'pending' }));
          return new Response(JSON.stringify(data), {
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      };
      const originalNet = net.fetch.bind(net);
      net.fetch = async (input, options) => {
        if (String(input).endsWith('/thumb')) {
          if (global.__thumbnailError) return new Response('', { status: 404 });
          if (global.__holdThumbnail)
            await new Promise((resolve) => {
              global.__releaseThumbnail = resolve;
            });
        }
        return originalNet(input, options);
      };
    });
    await page.getByRole('button', { name: '刷新素材', exact: true }).click();
    const loader = page.locator('.asset-card .thumb-loading .lattice-loader');
    await loader.waitFor();
    const animation = await loader
      .locator('.lattice-loader__run .lattice-loader__cell:not([data-hole])')
      .first()
      .evaluate((el) => ({
        name: getComputedStyle(el).animationName,
        playState: getComputedStyle(el).animationPlayState,
      }));
    assert.equal(animation.name, 'lattice-on');
    assert.equal(animation.playState, 'running');
    const progress = await loader.evaluate(
      (el) => el.getAnimations({ subtree: true })[0]?.currentTime,
    );
    await page.waitForTimeout(200);
    assert.ok(
      await loader.evaluate(
        (el, start) => el.getAnimations({ subtree: true })[0]?.currentTime > start,
        progress,
      ),
    );
    const grid = await loader.locator('.lattice-loader__grid').boundingBox();
    const frame = await page.locator('.asset-card .thumbnail').boundingBox();
    assert.ok(
      Math.abs(grid.x + grid.width / 2 - frame.x - frame.width / 2) < 1,
      'lattice must be horizontally centered',
    );
    assert.ok(
      Math.abs(grid.y + grid.height / 2 - frame.y - frame.height / 2) < 1,
      'lattice must be vertically centered',
    );
    await page.screenshot({ path: path.join(qa, '01-generating.png') });
    await app.evaluate(() => {
      global.__pendingThumb = false;
      global.__holdThumbnail = true;
    });
    await page.reload();
    await page.locator('.asset-card .thumb-loading').waitFor();
    assert.match(await page.locator('.asset-card .thumb-loading').innerText(), /读取预览中/);
    await page.screenshot({ path: path.join(qa, '02-image-loading.png') });
    await app.evaluate(() => {
      global.__holdThumbnail = false;
      global.__releaseThumbnail?.();
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.asset-card img')?.naturalWidth > 0 &&
        !document.querySelector('.asset-card .thumb-loading'),
    );
    await app.evaluate(() => {
      global.__thumbnailError = true;
    });
    await page.reload();
    await page.getByText('预览加载失败', { exact: true }).waitFor();
    assert.equal(await page.locator('.asset-card .lattice-loader').count(), 0);
    await page.screenshot({ path: path.join(qa, '03-error-static.png') });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          checks: [
            'pending generation shows animated Lattice cells',
            'animation time advances',
            'image read shows loading state',
            'loaded image removes loader',
            'failed image does not spin forever',
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log('Thumbnail loading states passed');
  } finally {
    if (app) {
      await app.evaluate(() => global.__releaseThumbnail?.()).catch(() => {});
      await app.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
