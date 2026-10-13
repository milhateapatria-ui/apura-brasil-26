const { cachedFetch, jsonError, urlForResults, normalize } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
  if (req.method !== 'GET') return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Use uma requisição GET.');
  const office = String(req.query.office || 'presidente').toLowerCase();
  const state = String(req.query.state || 'br').toLowerCase();
  const city = req.query.city ? String(req.query.city) : null;
  const round = String(req.query.round || '1');
  try {
    const url = urlForResults({ office, state, city, round });
    const root = await cachedFetch(url);
    return res.status(200).json(normalize(root, url));
  } catch (err) {
    const status = Number(err.status) || 502;
    const code = status === 400 ? 'INVALID_FILTER' : status === 404 ? 'TSE_DATA_NOT_AVAILABLE' : 'TSE_SOURCE_ERROR';
    const message = err.name === 'TimeoutError' || err.name === 'AbortError'
      ? 'O TSE demorou para responder. Tente novamente em instantes.'
      : (err.message || 'Não foi possível consultar os dados oficiais do TSE.');
    return jsonError(res, status === 400 ? 400 : status === 404 ? 503 : status, code, message);
  }
};
