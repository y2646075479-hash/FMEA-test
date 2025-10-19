// 该模块负责加载环境变量并整理为后端运行所需的配置项
require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || ''
  },
  webSearch: {
    apiKey: process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || '',
    engine: (process.env.WEB_ENGINE || 'baidu').toLowerCase(),
    topN: Number(process.env.WEB_TOP_N || 8)
  }
};

module.exports = {
  ...config,
  isDebug: config.logLevel === 'debug'
};
