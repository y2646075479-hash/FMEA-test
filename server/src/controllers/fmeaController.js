// FMEA 控制器负责衔接路由与服务层，处理 FMEA 生成请求的输入输出
const { generateFMEA, FMEAServiceError } = require('../services/fmeaService');

async function generate(req, res) {
  try {
    const part = (req.body?.part || '').trim();
    const count = Number(req.body?.count || 10);
    const result = await generateFMEA({ part, count });
    res.json(result);
  } catch (err) {
    if (err instanceof FMEAServiceError && err.status && err.body) {
      return res.status(err.status).json(err.body);
    }
    console.error('[fmea/generate] error:', err);
    res.status(500).json({ error: 'server_error', message: String(err?.message || err) });
  }
}

module.exports = {
  generate
};
