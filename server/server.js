/**
 * server.js  — FMEA 后端（DeepSeek 真实生成版）
 * ------------------------------------------------------------
 * - /health        : 健康检查 + 配置概览（不泄露密钥）
 * - /fmea/generate : DeepSeek 生成 FMEA（严格 JSON、校验-返修；不做程序填充）
 * - /web/search    : 联网搜索（SerpAPI + Baidu），仅返回标题+URL
 *
 * 依赖：Node.js 18+（内置 fetch），express, cors, dotenv
 * 安装：npm i express cors dotenv
 * 运行：node server.js
 */

require('dotenv').config();                 // 加载 .env
const express = require('express');
const cors = require('cors');
// ------------------------- 基础配置 -------------------------
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
const LLM_MODEL    = process.env.LLM_MODEL    || 'deepseek-chat';
const LLM_API_KEY  = process.env.DEEPSEEK_API_KEY || '';

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || '';
const WEB_ENGINE      = (process.env.WEB_ENGINE || 'baidu').toLowerCase();  // 目前仅支持 baidu
const WEB_TOP_N       = Number(process.env.WEB_TOP_N || 8);

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const isDebug   = LOG_LEVEL === 'debug';

if (!LLM_API_KEY) {
  console.warn('[warn] DEEPSEEK_API_KEY 未配置，/fmea/generate 将不可用');
}

// ------------------------- App 初始化 -------------------------
const app = express();
app.use(cors());                            // 默认允许跨域，前端易于调用
app.use(express.json({ limit: '1mb' }));    // JSON 请求体

// （可选）如需托管静态前端，可解开下行并把目录指向你的前端路径
// app.use(express.static(path.join(__dirname, '../')));

// ------------------------- System Prompt（最终版） -------------------------
// 已包含：输入校验(风电零部件相关性)、"None" 使用规则、字段齐全与 RPN 一致性、*_new 合理性等
const SYSTEM_PROMPT = `
你是一名风电行业资深可靠性/FMEA 工程师，负责为指定“风电设备零部件”生成结构化 FMEA 表。你的输出直接进入生产系统展示，必须满足：

0. 输入校验：
- 先判断用户输入是否为风电设备的零部件/子系统/部位（如：叶片、主轴、齿轮箱、偏航系统、变桨轴承、发电机、塔筒、机舱、刹车系统、滑环、液压站、密封圈等）。
- 若为同义/别称，请规范化为常用部件名（如“桨叶”→“叶片”）。
- 若与风电无关或无法合理映射：不要硬套；输出错误 JSON（valid=false），并给出 3–6 个正确示例。

1. 语言与风格：中文；短句/要点式；不空话套话；不要随意编造数据。确实无法判断时允许用字符串 "None"（非空串/非 null）。

2. FMEA 分值：
- 严重度S/发生度O/探测度D 均为 1–10 的整数（D 越小越易检测到）。
- 风险序数 = S×O×D；风险序数_new = S_new×O_new×D_new。
- 优先给出整数；若确实无法判断，用 "None"，且对应 RPN 必须为 "None"。

3. 项目命名：
- 优先“零部件+（子系统/部位）”：如“变桨轴承（周边件_支撑面）”；否则仅零部件名。

4. 输出结构（v2，仅 JSON）：
{
  "source": "llm",
  "valid": true,
  "normalized_part": "规范化后的部件名",
  "items": [
    {
      "项目": "",
      "潜在失效模式": "",
      "潜在失效后果": "",
      "严重度": 0,
      "潜在失效机理": "",
      "发生度": 0,
      "现有控制方法": "",
      "现有探测方法": "",
      "探测度": 0,
      "建议措施": "",
      "严重度_new": 0,
      "发生度_new": 0,
      "探测度_new": 0,
      "风险序数": 0,
      "风险序数_new": 0
    }
  ],
  "error": null
}
- 若输入无效：返回 { source:"llm", valid:false, normalized_part:"None", items:[], error:{ type:"invalid_input", message:"...", input:"...", suggestions:[...] } }
- 允许任意字段为字符串 "None"（确实无法判断时），但不要空字符串。

5. 质量要求：
- 未指定条数默认 8–12；条目不重复，覆盖材料/腐蚀/润滑/装配/制造/密封/振动疲劳/热环境/传动误差/检测失效/外物等维度。
- 现有控制方法/现有探测方法/建议措施尽量具体可执行；无把握可为 "None"。
- *_new 通常 ≤ 原值（O_new 或 D_new 一般下降；S_new 仅在有工程依据时降低）。

6. 一致性自检（你输出前自行保证）：
- 数值字段若不是 "None" 就必须是 1–10 的整数；
- 每条 15 字段齐全；文本字段不得空字符串（未知用 "None"）；
- 若参与乘法的 S/O/D 均为整数，则 RPN 必须等于其乘积；若任一为 "None"，对应 RPN 必须为 "None"；
- 输出只能是 JSON。
`;

// ------------------------- 工具函数 -------------------------
/** 构造用户提示（把用户输入部件与条数告知模型） */
function buildUserPrompt(part, count = 10) {
  const n = Math.min(12, Math.max(3, Number(count) || 10));
  const p = (part || '').trim() || '（未提供）';
  return `
请针对“${p}”生成 ${n} 条 FMEA 项。
若输入与风电无关或无法映射为风电零部件，请按“无效输入”返回（valid=false）。
请覆盖材料、制造/装配、润滑、腐蚀/老化、振动疲劳、密封、传动误差、检测/监测失效、外物等典型风险。
所有字段必须齐全；数值字段优先给 1–10 整数，确实无法判断可用 "None"；RPN 规则同 System。
最终只输出 JSON 对象（v2 结构）。
`.trim();
}

/** 安全 JSON 解析（失败返回 null） */
function parseJSONSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** v2 结构校验（只报告问题，不做程序改值） */
function validateFMEA_v2(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') {
    problems.push('顶层必须为对象');
    return problems;
  }
  if (payload.source !== 'llm') problems.push('source 必须为 "llm"');
  if (typeof payload.valid !== 'boolean') problems.push('valid 必须为布尔值');

  // 无效输入：items 必须空，error 必须完整
  if (payload.valid === false) {
    if (!Array.isArray(payload.items) || payload.items.length !== 0) {
      problems.push('当 valid=false 时，items 必须为空数组');
    }
    if (!payload.error || typeof payload.error !== 'object') {
      problems.push('当 valid=false 时，必须提供 error 对象');
    } else {
      if (payload.error.type !== 'invalid_input') problems.push('error.type 必须为 "invalid_input"');
      if (!payload.error.message) problems.push('error.message 不能为空');
      if (!Array.isArray(payload.error.suggestions) || payload.error.suggestions.length < 3) {
        problems.push('error.suggestions 需给出 3 条以上示例');
      }
    }
    return problems; // 到此为止
  }

  // valid === true
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    problems.push('valid=true 时，items 必须为非空数组');
    return problems;
  }

  const reqKeys = [
    '项目','潜在失效模式','潜在失效后果','严重度','潜在失效机理','发生度',
    '现有控制方法','现有探测方法','探测度','建议措施',
    '严重度_new','发生度_new','探测度_new','风险序数','风险序数_new'
  ];

  const isNum1to10 = (v)=> Number.isInteger(v) && v>=1 && v<=10;
  const isNoneStr  = (v)=> v === 'None';
  const isNumOrNone= (v)=> isNum1to10(v) || isNoneStr(v);

  payload.items.forEach((it, i)=>{
    // 字段齐全
    reqKeys.forEach(k => { if (!(k in it)) problems.push(`第${i+1}条 缺少字段：${k}`); });

    // 文本字段：允许 "None"，但不许空字符串
    ['项目','潜在失效模式','潜在失效后果','潜在失效机理','现有控制方法','现有探测方法','建议措施']
      .forEach(k=>{
        const v = it[k];
        if (v === '' || v === null || v === undefined) problems.push(`第${i+1}条 字段 ${k} 不能为空（未知请用 "None"）`);
      });

    // 数值字段：必须为 1–10 的整数 或 "None"
    ['严重度','发生度','探测度','严重度_new','发生度_new','探测度_new'].forEach(k=>{
      if (!isNumOrNone(it[k])) problems.push(`第${i+1}条 ${k} 必须为 1–10 的整数或 "None"，实际：${it[k]}`);
    });

    // RPN 校验（参与值全为整数才强校验；若任一为 "None"，RPN 必须为 "None"）
    const s  = it['严重度'];
    const o  = it['发生度'];
    const d  = it['探测度'];
    const sn = it['严重度_new'];
    const on = it['发生度_new'];
    const dn = it['探测度_new'];

    if (isNum1to10(s) && isNum1to10(o) && isNum1to10(d)) {
      const rpn = s*o*d;
      if (it['风险序数'] !== rpn) problems.push(`第${i+1}条 风险序数 应等于 S×O×D=${rpn}，实际：${it['风险序数']}`);
    } else {
      if (!isNoneStr(it['风险序数'])) problems.push(`第${i+1}条 存在 "None" 分值时，风险序数必须为 "None"`);
    }
    if (isNum1to10(sn) && isNum1to10(on) && isNum1to10(dn)) {
      const rpnNew = sn*on*dn;
      if (it['风险序数_new'] !== rpnNew) problems.push(`第${i+1}条 风险序数_new 应等于 S_new×O_new×D_new=${rpnNew}，实际：${it['风险序数_new']}`);
    } else {
      if (!isNoneStr(it['风险序数_new'])) problems.push(`第${i+1}条 存在 "None" 分值时，风险序数_new 必须为 "None"`);
    }

    // *_new 合理性（若均为整数）
    const isInt = (v)=> Number.isInteger(v);
    if (isInt(s) && isInt(sn) && sn > s) problems.push(`第${i+1}条 S_new 不应高于 S`);
    if (isInt(o) && isInt(on) && on > o) problems.push(`第${i+1}条 O_new 不应高于 O`);
    if (isInt(d) && isInt(dn) && dn > d) problems.push(`第${i+1}条 D_new 不应高于 D`);
  });

  return problems;
}

/** 调用 DeepSeek（JSON-only 输出） */
async function callDeepSeek(messages) {
  const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: LLM_MODEL,
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
  // API 返回是 JSON；取 message.content（即模型的 JSON 字符串）
  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } catch {
    // 兜底：部分异常时直接返回文本
    return text;
  }
}

// ------------------------- API 路由 -------------------------

/** 健康检查 */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    model: LLM_MODEL,
    web: {
      provider: SERPAPI_API_KEY ? 'serpapi' : 'none',
      engine: SERPAPI_API_KEY ? WEB_ENGINE : 'none',
      top_n: WEB_TOP_N
    }
  });
});

/** FMEA 生成（DeepSeek 真实产出；只校验不改值；失败返修最多2轮） */
app.post('/fmea/generate', async (req, res) => {
  try {
    if (!LLM_API_KEY) {
      return res.status(500).json({ error: 'no_api_key', message: 'DEEPSEEK_API_KEY 未配置' });
    }
    const part  = (req.body?.part || '').trim();
    const count = Number(req.body?.count || 10);

    // 轮次 0：首次生成
    let messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(part, count) }
    ];
    if (isDebug) console.log('[fmea] prompt:', messages[1].content);

    let raw = await callDeepSeek(messages);
    if (isDebug) console.log('[fmea] raw length:', raw?.length);

    let parsed = parseJSONSafe(raw);
    let problems = validateFMEA_v2(parsed);
    let rounds = 0;

    // 最多 2 轮返修：把问题点返回给模型，让“模型自己修正”
    while (problems.length && rounds < 2) {
      rounds += 1;
      if (isDebug) console.log(`[fmea] round${rounds} problems:`, problems);

      const repair = `
上次输出的 JSON 存在以下问题，请严格按 System 规则修复并仅返回完整 JSON：
${problems.map((p,i)=>`${i+1}. ${p}`).join('\n')}
原输出如下：
<BEGIN_RAW_JSON>
${raw}
<END_RAW_JSON>
      `.trim();

      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(part, count) },
        { role: 'assistant', content: raw.slice(0, 6000) },
        { role: 'user',   content: repair }
      ];

      raw = await callDeepSeek(messages);
      parsed = parseJSONSafe(raw);
      problems = validateFMEA_v2(parsed);
    }

    if (problems.length) {
      // 仍不合规：如实返回，便于前端提示；不做程序改值
      return res.status(502).json({ error: 'llm_invalid', detail: problems, raw });
    }

    return res.json(parsed);

  } catch (err) {
    console.error('[fmea/generate] error:', err);
    res.status(500).json({ error: 'server_error', message: String(err?.message || err) });
  }
});

/** 参考资料（SerpAPI / baidu，带分页 + 规范化字段） */
app.get('/api/refs', async (req, res) => {
  try {
    const q        = String(req.query.q || '').trim();
    const engine   = String(req.query.engine || WEB_ENGINE || 'baidu').toLowerCase();
    const page     = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(20, Math.max(5, parseInt(req.query.page_size || '10', 10)));
    const API_KEY  = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || SERPAPI_API_KEY;

    if (!q) return res.json({ q, engine, items: [], prev_page_token: null, next_page_token: null });
    if (!API_KEY) return res.status(500).json({ error: 'SERPAPI_API_KEY 未配置' });

    // SerpAPI（baidu）分页参数：page/num/start/pn 都传更稳妥
    const start = (page - 1) * pageSize;
    const url =
      `https://serpapi.com/search.json?engine=${encodeURIComponent(engine)}` +
      `&q=${encodeURIComponent(q)}&api_key=${API_KEY}` +
      `&device=desktop&page=${page}&num=${pageSize}&start=${start}&pn=${start}`;

    const r = await fetch(url);
    const j = await r.json();

    const list = Array.isArray(j.organic_results) ? j.organic_results : [];

    const getFileType = (u) => {
      const m = (u || '').toLowerCase().match(/\.(pdf|docx?|pptx?|xlsx?)($|\?|#)/);
      if (!m) return 'html';
      const ext = m[1];
      if (['doc','docx'].includes(ext)) return 'doc';
      if (['ppt','pptx'].includes(ext)) return 'ppt';
      if (['xls','xlsx'].includes(ext)) return 'xls';
      return ext; // pdf
    };

    const items = list.map((it, i) => {
      const link = it.link || it.url || '';
      const title = it.title || it.snippet_title || '';
      const snippet =
        it.snippet ||
        (it.rich_snippet && (it.rich_snippet.top?.text || it.rich_snippet.bottom?.text || it.rich_snippet.text)) ||
        (Array.isArray(it.snippet_highlighted_words) ? it.snippet_highlighted_words.join(' … ') : '') ||
        it.description || '';
      let host = '';
      try { host = new URL(link).host.replace(/^www\./, ''); } catch {}

      const published_at = it.date || it.published_date || it.uploaded_at || null;

      // 粗粒度来源标签
      const source_tag = (() => {
        const h = host || '';
        if (/ieeexplore|springer|elsevier|mdpi|acm|cnki|wanfang|cqvip/.test(h)) return '论文/学术';
        if (/wenku\.baidu|docin|mbalib|xueshu/.test(h)) return '文库';
        if (/(^|\.)(gov|standard|gb|bs|iso|iec)(\.|$)/.test(h)) return '标准/规范';
        if (/siemens|vestas|ge\.com|goldwind|enercon|nordex|abb|schneider|skf|nsk|timken|fag/.test(h)) return '厂商/手册';
        return '网页';
      })();

      return {
        title,
        url: link,
        host,
        favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '',
        snippet,
        published_at,
        filetype: getFileType(link),
        source_tag,
        engine_pos: it.position || (start + i + 1)
      };
    });

    // 去重（规范化 URL + 标题）
    const seen = new Set();
    const dedup = [];
    for (const x of items) {
      const key = (x.url || '').replace(/[?#].*$/, '') + '|' + (x.title || '');
      if (!seen.has(key)) { seen.add(key); dedup.push(x); }
    }

    res.json({
      q, engine,
      items: dedup.slice(0, pageSize),
      prev_page_token: page > 1 ? String(page - 1) : null,
      next_page_token: dedup.length >= pageSize ? String(page + 1) : null
    });
  } catch (e) {
    res.status(500).json({ error: 'refs_failed', detail: e.message });
  }
});

// ------------------------- 启动 -------------------------
app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
  console.log(`[llm] model=${LLM_MODEL} base=${LLM_BASE_URL} key=${LLM_API_KEY ? '***' : 'MISSING'}`);
  console.log(`[web] provider=${SERPAPI_API_KEY ? 'serpapi' : 'none'} engine=${WEB_ENGINE} top_n=${WEB_TOP_N}`);
});
