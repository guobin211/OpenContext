#!/usr/bin/env node
/**
 * 独立启动 API 服务器（供 Tauri 开发模式使用）
 * 运行: npm run api:dev
 */
const { createUiServer } = require('../src/ui/server');

const PORT = process.env.API_PORT || 4321;
const HOST = process.env.API_HOST || '127.0.0.1';

(async () => {
  try {
    await createUiServer({ host: HOST, port: Number(PORT) });
    console.log(`[api] OpenContext API server running at http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('[api] Failed to start:', err.message);
    process.exit(1);
  }
})();

