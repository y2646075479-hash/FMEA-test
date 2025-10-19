// FMEA 服务负责调用大模型并执行结果校验与返修循环
const { isDebug, llm } = require('../config');
const SYSTEM_PROMPT = require('../prompts/systemPrompt');
const { callDeepSeek } = require('./deepseekService');
const { buildUserPrompt, parseJSONSafe, validateFMEA_v2 } = require('../utils/fmea');

class FMEAServiceError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function generateFMEA({ part, count }) {
  if (!llm.apiKey) {
    throw new FMEAServiceError(
      'DEEPSEEK_API_KEY 未配置',
      500,
      { error: 'no_api_key', message: 'DEEPSEEK_API_KEY 未配置' }
    );
  }

  let messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(part, count) }
  ];

  if (isDebug) console.log('[fmea] prompt:', messages[1].content);

  let raw = await callDeepSeek(messages);
  if (isDebug) console.log('[fmea] raw length:', raw?.length);

  let parsed = parseJSONSafe(raw);
  let problems = validateFMEA_v2(parsed);
  let rounds = 0;

  while (problems.length && rounds < 2) {
    rounds += 1;
    if (isDebug) console.log(`[fmea] round${rounds} problems:`, problems);

    const repair = `
上次输出的 JSON 存在以下问题，请严格按 System 规则修复并仅返回完整 JSON。
${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}
原输出如下：
<BEGIN_RAW_JSON>
${raw}
<END_RAW_JSON>
    `.trim();

    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(part, count) },
      { role: 'assistant', content: raw.slice(0, 6000) },
      { role: 'user', content: repair }
    ];

    raw = await callDeepSeek(messages);
    parsed = parseJSONSafe(raw);
    problems = validateFMEA_v2(parsed);
  }

  if (problems.length) {
    throw new FMEAServiceError(
      'llm_invalid',
      502,
      { error: 'llm_invalid', detail: problems, raw }
    );
  }

  return parsed;
}

module.exports = {
  generateFMEA,
  FMEAServiceError
};
