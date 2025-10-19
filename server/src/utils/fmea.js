// FMEA 工具模块提供提示词构建、JSON 解析以及结构化校验的辅助函数
function buildUserPrompt(part, count = 10) {
  const n = Math.min(12, Math.max(3, Number(count) || 10));
  const p = (part || '').trim() || '（未提供）';
  return `
请针对“${p}”生成 ${n} 条 FMEA 项目。
若输入与风电无关或无法映射为风电零部件，请按“无效输入”返回（valid=false）。
请覆盖材料、制造/装配、润滑、腐蚀/老化、振动疲劳、密封、传动误差、检测/监测失效、外物等典型风险。
所有字段必须齐全；数值字段优先给 1-10 整数，确实无法判断可为 "None"；RPN 规则遵从 System。
最终只输出 JSON 对象（v2 结构）。
`.trim();
}

function parseJSONSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateFMEA_v2(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') {
    problems.push('顶层必须为对象');
    return problems;
  }
  if (payload.source !== 'llm') problems.push('source 必须为 "llm"');
  if (typeof payload.valid !== 'boolean') problems.push('valid 必须为布尔值');

  if (payload.valid === false) {
    if (!Array.isArray(payload.items) || payload.items.length !== 0) {
      problems.push('在 valid=false 时，items 必须为空数组');
    }
    if (!payload.error || typeof payload.error !== 'object') {
      problems.push('在 valid=false 时，必须提供 error 对象');
    } else {
      if (payload.error.type !== 'invalid_input') problems.push('error.type 必须为 "invalid_input"');
      if (!payload.error.message) problems.push('error.message 不能为空');
      if (!Array.isArray(payload.error.suggestions) || payload.error.suggestions.length < 3) {
        problems.push('error.suggestions 需给出 3 条以上示例');
      }
    }
    return problems;
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    problems.push('valid=true 时，items 必须为非空数组');
    return problems;
  }

  const reqKeys = [
    '项目', '潜在失效模式', '潜在失效后果', '严重度', '潜在失效机理', '发生度',
    '现有控制方法', '现有探测方法', '探测度', '建议措施',
    '严重度_new', '发生度_new', '探测度_new', '风险序数', '风险序数_new'
  ];

  const isNum1to10 = (v) => Number.isInteger(v) && v >= 1 && v <= 10;
  const isNoneStr = (v) => v === 'None';
  const isNumOrNone = (v) => isNum1to10(v) || isNoneStr(v);

  payload.items.forEach((it, i) => {
    reqKeys.forEach((k) => {
      if (!(k in it)) problems.push(`第 ${i + 1} 条缺少字段 ${k}`);
    });

    ['项目', '潜在失效模式', '潜在失效后果', '潜在失效机理', '现有控制方法', '现有探测方法', '建议措施']
      .forEach((k) => {
        const v = it[k];
        if (v === '' || v === null || v === undefined) {
          problems.push(`第 ${i + 1} 条字段 ${k} 不能为空（未知请填 "None"）`);
        }
      });

    ['严重度', '发生度', '探测度', '严重度_new', '发生度_new', '探测度_new'].forEach((k) => {
      if (!isNumOrNone(it[k])) {
        problems.push(`第 ${i + 1} 条 ${k} 必须为 1-10 的整数或 "None"，实际：${it[k]}`);
      }
    });

    const s = it['严重度'];
    const o = it['发生度'];
    const d = it['探测度'];
    const sn = it['严重度_new'];
    const on = it['发生度_new'];
    const dn = it['探测度_new'];

    if (isNum1to10(s) && isNum1to10(o) && isNum1to10(d)) {
      const rpn = s * o * d;
      if (it['风险序数'] !== rpn) {
        problems.push(`第 ${i + 1} 条风险序数应等于 S×O×D=${rpn}，实际：${it['风险序数']}`);
      }
    } else if (!isNoneStr(it['风险序数'])) {
      problems.push(`第 ${i + 1} 条存在 "None" 分值时，风险序数必须为 "None"`);
    }

    if (isNum1to10(sn) && isNum1to10(on) && isNum1to10(dn)) {
      const rpnNew = sn * on * dn;
      if (it['风险序数_new'] !== rpnNew) {
        problems.push(`第 ${i + 1} 条风险序数_new 应等于 S_new×O_new×D_new=${rpnNew}，实际：${it['风险序数_new']}`);
      }
    } else if (!isNoneStr(it['风险序数_new'])) {
      problems.push(`第 ${i + 1} 条存在 "None" 分值时，风险序数_new 必须为 "None"`);
    }

    const isInt = (v) => Number.isInteger(v);
    if (isInt(s) && isInt(sn) && sn > s) problems.push(`第 ${i + 1} 条 S_new 不应高于 S`);
    if (isInt(o) && isInt(on) && on > o) problems.push(`第 ${i + 1} 条 O_new 不应高于 O`);
    if (isInt(d) && isInt(dn) && dn > d) problems.push(`第 ${i + 1} 条 D_new 不应高于 D`);
  });

  return problems;
}

module.exports = {
  buildUserPrompt,
  parseJSONSafe,
  validateFMEA_v2
};
