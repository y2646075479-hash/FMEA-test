// DeepSeek 服务封装与模型 API 的 HTTP 交互逻辑
const { llm } = require('../config');

async function callDeepSeek(messages) {
  const resp = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages
    })
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`DeepSeek HTTP ${resp.status}: ${text}`);
  }

  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } catch {
    return text;
  }
}

module.exports = {
  callDeepSeek
};
