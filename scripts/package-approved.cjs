'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const approval = JSON.parse(fs.readFileSync(path.join(root, 'release-approval.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (approval.approved !== true || !approval.approvedAt || approval.packageVersion !== pkg.version) {
  console.error('本版本没有匹配的用户打包授权，请查看 release-approval.json。');
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), '--win', 'dir'],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.error ? 1 : (result.status ?? 1));
