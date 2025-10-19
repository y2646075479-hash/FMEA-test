#!/usr/bin/env node
/**
 * 联网搜索接口调试脚本
 * 依赖后端服务已运行（默认 http://127.0.0.1:3001/api/refs?q=...）
 * 可通过环境变量或命令行参数覆盖查询关键词
 *
 * 用法示例：
 *   node scripts/test-refs.js                         # 使用默认关键词
 *   node scripts/test-refs.js "风电 主轴维护 方案"       # 指定关键词
 *   TEST_REFS_PORT=4000 npm run test:refs             # 指定端口
 */

const { env, argv, exit } = process;

const HOST = env.TEST_REFS_HOST || env.HOST || '127.0.0.1';
const PORT = Number(env.TEST_REFS_PORT || env.PORT || 3001);
const QUERY = argv[2] || env.TEST_REFS_QUERY || '风电 变桨轴承 维护';
const URL = `http://${HOST}:${PORT}/api/refs?q=${encodeURIComponent(QUERY)}`;

async function main() {
  console.log(`[test-refs] GET ${URL}`);

  const response = await fetch(URL);
  const raw = await response.text();

  if (!response.ok) {
    console.error(`[test-refs] HTTP ${response.status}`);
    console.error(raw);
    exit(1);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error('[test-refs] 响应无法解析为 JSON');
    console.error(raw);
    exit(1);
    return;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  console.log(`[test-refs] 返回条目数 ${items.length}`);
  if (items[0]) {
    console.log(`[test-refs] 第 1 条标题=${items[0].title || '无标题'}`);
    console.log(`[test-refs] 第 1 条来源=${items[0].host || '未知'}`);
  }

  console.log('[test-refs] ✅ 接口调用成功，可参考输出继续调试');
}

main().catch((err) => {
  console.error('[test-refs] 运行失败:', err);
  exit(1);
});
