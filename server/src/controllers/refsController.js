// 参考资料控制器封装查询参数并调用搜索服务提供分页结果
const { searchReferences, SearchServiceError } = require('../services/searchService');
const config = require('../config');

async function getReferences(req, res) {
  try {
    const q = req.query.q;
    const engine = req.query.engine || config.webSearch.engine;
    const page = req.query.page;
    const pageSize = req.query.page_size;

    const result = await searchReferences({ q, engine, page, pageSize });
    res.json(result);
  } catch (err) {
    if (err instanceof SearchServiceError && err.status && err.body) {
      return res.status(err.status).json(err.body);
    }
    console.error('[api/refs] error:', err);
    res.status(500).json({ error: 'refs_failed', detail: err?.message || String(err) });
  }
}

module.exports = {
  getReferences
};
