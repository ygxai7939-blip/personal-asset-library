const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const assert = require('node:assert/strict');
(async () => {
  const qa = path.resolve(__dirname, '../.qa/input');
  await fs.mkdir(qa, { recursive: true });
  const root = await fs.mkdtemp(path.join(qa, 'run-'));
  let app,
    page,
    clipboardChanged = false;
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
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('.sidebar .brand').waitFor();
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'qa-file';
      input.type = 'file';
      input.hidden = true;
      document.body.append(input);
    });
    await page.locator('#qa-file').setInputFiles(path.join(__dirname, 'fixtures/review/01.jpg'));
    const paths = await page.evaluate(() =>
      window.library.dropped(Array.from(document.querySelector('#qa-file').files)),
    );
    assert.ok(paths[0]?.endsWith('01.jpg'), 'real file path must survive bridge transport');
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(document.querySelector('#qa-file').files[0]);
      document
        .querySelector('.workspace')
        .dispatchEvent(
          new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
        );
    });
    await page.getByText('导入结果', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 1);
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    console.log('native path drag passed');
    const virtual = await sharp({
      create: { width: 130, height: 90, channels: 3, background: '#bb8899' },
    })
      .png()
      .toBuffer();
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], '微信虚拟图片.png', { type: 'image/png' }));
      document
        .querySelector('.workspace')
        .dispatchEvent(
          new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
        );
    }, virtual.toString('base64'));
    await page.getByText('导入结果', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 2);
    await page.getByRole('button', { name: '关闭导入结果' }).click();
    console.log('virtual file bytes drag passed');
    const paste = await sharp({
      create: { width: 160, height: 100, channels: 3, background: '#449977' },
    })
      .png()
      .toBuffer();
    await app.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
      const previous = await clipboard.read();
      global.__originalClipboard = [];
      for (const item of previous) {
        const data = {};
        for (const type of item.types) data[type] = await item.getType(type);
        global.__originalClipboard.push(new ClipboardItem(data));
      }
      global.__testClipboard = Buffer.from(base64, 'base64');
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([global.__testClipboard], { type: 'image/png' }),
        }),
      ]);
      for (const item of await clipboard.read())
        if (item.types.includes('image/png')) {
          global.__testClipboard = Buffer.from(
            await (await item.getType('image/png')).arrayBuffer(),
          );
          break;
        }
    }, paste.toString('base64'));
    clipboardChanged = true;
    await page.locator('.workspace').click({ position: { x: 25, y: 35 } });
    await page.keyboard.press('Control+v');
    await page.getByText('剪贴板图片已入库', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.asset-card').length === 3);
    console.log('native clipboard PNG paste passed');
    await page.keyboard.press('Control+v');
    await page.getByText('剪贴板图片已存在，已复用', { exact: true }).waitFor();
    assert.equal(await page.locator('.asset-card').count(), 3);
    await page.evaluate(() => {
      document
        .querySelector('.workspace')
        .dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          }),
        );
    });
    await page.getByText(/没有读取到拖入的文件/).waitFor();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(qa, 'input-fixed.png') });
    await fs.writeFile(
      path.join(qa, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: !!process.env.ASSET_TEST_EXECUTABLE,
          checks: [
            'native path drag via actual File objects',
            'virtual image File byte fallback',
            'real system ClipboardItem image paste',
            'clipboard duplicate detection',
            'empty drag feedback',
          ],
          errors,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(errors);
    if (page && !page.isClosed()) {
      console.error(await page.locator('body').innerText());
      await page.screenshot({ path: path.join(qa, 'failure.png') }).catch(() => {});
    }
    throw e;
  } finally {
    if (app) {
      if (clipboardChanged)
        await app
          .evaluate(async ({ clipboard }) => {
            const items = await clipboard.read();
            let unchanged = false;
            for (const item of items) {
              if (item.types.includes('image/png')) {
                const blob = await item.getType('image/png');
                unchanged = Buffer.from(await blob.arrayBuffer()).equals(global.__testClipboard);
                if (unchanged) break;
              }
            }
            if (unchanged) {
              if (global.__originalClipboard.length)
                await clipboard.write(global.__originalClipboard);
              else clipboard.clear();
            }
          })
          .catch(console.error);
      await app.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
