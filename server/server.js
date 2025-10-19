/**
 * FMEA 后端入口
 * - /health        : 健康检查与配置概览
 * - /fmea/generate : 调用 DeepSeek 生成 FMEA
 * - /api/refs      : SerpAPI + Baidu 联网搜索
 */

const app = require('./src/app');
const config = require('./src/config');

if (!config.llm.apiKey) {
  console.warn('[warn] DEEPSEEK_API_KEY 未配置，/fmea/generate 将不可用');
}

app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  console.log(
    `[llm] model=${config.llm.model} base=${config.llm.baseUrl} key=${config.llm.apiKey ? '***' : 'MISSING'}`
  );
  console.log(
    `[web] provider=${config.webSearch.apiKey ? 'serpapi' : 'none'} engine=${config.webSearch.engine} top_n=${config.webSearch.topN}`
  );
});
