const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readClipboardImage, LIMIT } = require('../desktop/clipboard-image.cjs');
test('clipboard reads modern image blobs, handles unavailable formats and gives useful empty errors', async () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  const modern = {
    read: async () => [
      {
        types: ['text/plain', 'image/png'],
        getType: async () => new Blob([bytes], { type: 'image/png' }),
      },
    ],
  };
  const image = await readClipboardImage(modern);
  assert.equal(image.extension, 'png');
  assert.deepEqual([...image.bytes], [1, 2, 3]);
  const fallback = {
    read: async () => [
      {
        types: ['image/png', 'image/jpeg'],
        getType: async (type) => {
          if (type === 'image/png') throw new Error('无法转换');
          return new Blob([bytes]);
        },
      },
    ],
  };
  assert.equal((await readClipboardImage(fallback)).extension, 'jpg');
  await assert.rejects(
    readClipboardImage({ read: async () => [{ types: ['text/plain'] }] }),
    /复制图片/,
  );
  await assert.rejects(
    readClipboardImage({
      read: async () => [{ types: ['image/png'], getType: async () => ({ size: LIMIT + 1 }) }],
    }),
    /64 MB/,
  );
});
