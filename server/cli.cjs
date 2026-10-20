'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createLibraryServer } = require('./api.cjs');
(async () => {
  const configPath = process.argv[2];
  if (!configPath) throw new Error('用法：node server/cli.cjs 本机配置.json');
  const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
  const server = await createLibraryServer(config);
  console.log(`素材库后台已启动 ${server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      await server.close();
      process.exit(0);
    });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
