'use strict';
const LIMIT = 64 * 1024 * 1024;
async function readClipboardImage(clipboard) {
  // Electron 44 uses ClipboardItem/Blob, instead of the removed readImage().
  if (typeof clipboard.read === 'function') {
    const items = await clipboard.read();
    let conversionError;
    for (const item of items) {
      const images = item.types.filter((type) =>
        /^image\/(png|jpeg|webp|gif|bmp|tiff|avif)$/i.test(type),
      );
      images.sort((a, b) => Number(b === 'image/png') - Number(a === 'image/png'));
      for (const type of images) {
        try {
          const blob = await item.getType(type);
          if (!blob.size) continue;
          if (blob.size > LIMIT) throw new Error('剪贴板图片超过 64 MB，请另存为文件后导入');
          const bytes = Buffer.from(await blob.arrayBuffer());
          const extension =
            { 'image/jpeg': 'jpg', 'image/tiff': 'tif' }[type] || type.split('/')[1];
          return { bytes, type, extension };
        } catch (error) {
          conversionError = error;
        }
      }
    }
    if (conversionError) throw conversionError;
  } else if (typeof clipboard.readImage === 'function') {
    const image = clipboard.readImage();
    if (!image.isEmpty()) return { bytes: image.toPNG(), type: 'image/png', extension: 'png' };
  }
  throw new Error(
    '剪贴板没有可读取的图片。请在微信中打开原图后选择「复制图片」，或将图片另存为文件后拖入。',
  );
}
module.exports = { readClipboardImage, LIMIT };
