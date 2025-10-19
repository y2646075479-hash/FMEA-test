// 搜索服务封装 SerpAPI 调用及搜索结果清洗分页逻辑
const { webSearch } = require('../config');

class SearchServiceError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function searchReferences({ q, engine, page, pageSize }) {
  const query = String(q || '').trim();
  const resolvedEngine = String(engine || webSearch.engine || 'baidu').toLowerCase();
  const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
  const size = Math.min(20, Math.max(5, parseInt(pageSize || '10', 10) || 10));
  const apiKey = webSearch.apiKey;

  if (!query) {
    return {
      q: query,
      engine: resolvedEngine,
      items: [],
      prev_page_token: null,
      next_page_token: null
    };
  }

  if (!apiKey) {
    throw new SearchServiceError(
      'SERPAPI_API_KEY 未配置',
      500,
      { error: 'SERPAPI_API_KEY 未配置' }
    );
  }

  const start = (currentPage - 1) * size;
  const url = [
    `https://serpapi.com/search.json?engine=${encodeURIComponent(resolvedEngine)}`,
    `q=${encodeURIComponent(query)}`,
    `api_key=${apiKey}`,
    'device=desktop',
    `page=${currentPage}`,
    `num=${size}`,
    `start=${start}`,
    `pn=${start}`
  ].join('&');

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new SearchServiceError(
      `SerpAPI HTTP ${response.status}`,
      response.status,
      { error: 'refs_failed', detail }
    );
  }

  const payload = await response.json();
  const list = Array.isArray(payload.organic_results) ? payload.organic_results : [];
  const pagination = payload.serpapi_pagination || {};

  const BAD_HOSTS = new Set(['nourl.ubs.baidu.com']);

  const getFileType = (u) => {
    const m = (u || '').toLowerCase().match(/\.(pdf|docx?|pptx?|xlsx?)($|\?|#)/);
    if (!m) return 'html';
    const ext = m[1];
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (['ppt', 'pptx'].includes(ext)) return 'ppt';
    if (['xls', 'xlsx'].includes(ext)) return 'xls';
    return ext;
  };

  const items = list.map((it, i) => {
    const link = it.link || it.url || '';
    const title = it.title || it.snippet_title || '';
    const snippet =
      it.snippet ||
      (it.rich_snippet && (it.rich_snippet.top?.text || it.rich_snippet.bottom?.text || it.rich_snippet.text)) ||
      (Array.isArray(it.snippet_highlighted_words) ? it.snippet_highlighted_words.join(' · ') : '') ||
      it.description || '';
    let host = '';
    try {
      host = new URL(link).host.replace(/^www\./, '');
    } catch {
      host = '';
    }

    const publishedAt = it.date || it.published_date || it.uploaded_at || null;

    const sourceTag = (() => {
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
      published_at: publishedAt,
      filetype: getFileType(link),
      source_tag: sourceTag,
      engine_pos: it.position || start + i + 1
    };
  });

  const seen = new Set();
  let dedup = [];
  for (const item of items) {
    const key = (item.url || '').replace(/[?#].*$/, '') + '|' + (item.title || '');
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(item);
    }
  }

  const isBadUrl = (u) => {
    if (!u || typeof u !== 'string') return true;
    const s = u.trim();
    if (/^(javascript:|data:|about:)/i.test(s)) return true;
    try {
      const host = new URL(s).host.toLowerCase();
      if (!host) return true;
      if (BAD_HOSTS.has(host)) return true;
      if (host.startsWith('nourl.') && host.endsWith('.baidu.com')) return true;
      return false;
    } catch {
      return true;
    }
  };

  dedup = dedup.filter((x) => !isBadUrl(x.url));

  const hasNextFromApi = (() => {
    if (!pagination || typeof pagination !== 'object') return false;

    const nextFields = [
      pagination.next_page_token,
      pagination.next_page_link,
      pagination.next_page_url,
      pagination.next,
      pagination.next_link
    ];
    if (nextFields.some((v) => (typeof v === 'string' ? v.trim() !== '' : Boolean(v)))) {
      return true;
    }

    if (pagination.other_pages && typeof pagination.other_pages === 'object') {
      const numericKeys = Object.keys(pagination.other_pages)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n));
      if (numericKeys.length > 0 && currentPage < Math.max(...numericKeys)) {
        return true;
      }
    }

    return false;
  })();

  const hasNext = hasNextFromApi || list.length >= size;

  return {
    q: query,
    engine: resolvedEngine,
    items: dedup.slice(0, size),
    prev_page_token: currentPage > 1 ? String(currentPage - 1) : null,
    next_page_token: hasNext ? String(currentPage + 1) : null
  };
}

module.exports = {
  searchReferences,
  SearchServiceError
};
