#!/usr/bin/env node
/**
 * FMEA 生成接口调试脚本
 * 依赖后端服务已运行（默认 http://127.0.0.1:3001/fmea/generate）
 * 可通过环境变量或命令行参数覆盖部件名称与条目数量
 *
 * 用法示例：
 *   node scripts/test-fmea.js            # 使用默认参数
 *   node scripts/test-fmea.js 叶片        # 指定部件
 *   TEST_FMEA_COUNT=8 npm run test:fmea   # 指定条数
 */

const { env, argv, exit } = process;

const HOST = env.TEST_FMEA_HOST || env.HOST || '127.0.0.1';
const PORT = Number(env.TEST_FMEA_PORT || env.PORT || 3001);
const PART = argv[2] || env.TEST_FMEA_PART || '偏航系统';
const COUNT = Number(env.TEST_FMEA_COUNT || 5);
const URL = `http://${HOST}:${PORT}/fmea/generate`;

async function main() {
  console.log(`[test-fmea] POST ${URL}`);
  console.log(`[test-fmea] part="${PART}" count=${COUNT}`);

  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ part: PART, count: COUNT })
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error(`[test-fmea] HTTP ${response.status}`);
    console.error(raw);
    exit(1);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error('[test-fmea] 响应无法解析为 JSON');
    console.error(raw);
    exit(1);
    return;
  }

  if (!payload.valid) {
    console.warn('[test-fmea] 模型返回 valid=false，原始响应如下：');
    console.dir(payload, { depth: null });
    exit(1);
    return;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  console.log(`[test-fmea] 项目数量 ${items.length}`);
  if (items[0]) {
    const first = items[0];
    console.log(`[test-fmea] 第 1 条「${first['项目']}」风险序数=${first['风险序数']}`);
  }

  console.log('[test-fmea] ✅ 接口调用成功，可参考输出继续调试');
}

main().catch((err) => {
  console.error('[test-fmea] 运行失败:', err);
  exit(1);
});
