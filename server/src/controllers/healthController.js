// 健康检查控制器返回运行时关键配置，供外部探测服务状态
const config = require('../config');

function getHealth(req, res) {
  res.json({
    ok: true,
    model: config.llm.model,
    web: {
      provider: config.webSearch.apiKey ? 'serpapi' : 'none',
      engine: config.webSearch.apiKey ? config.webSearch.engine : 'none',
      top_n: config.webSearch.topN
    }
  });
}

module.exports = {
  getHealth
};
