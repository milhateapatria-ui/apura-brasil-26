const { BASE, UFS, cachedFetch, jsonError } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  if (req.method !== 'GET') return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Use uma requisição GET.');
  const state = String(req.query.state || '').toLowerCase();
  const election = String(req.query.election || '6259');
  if (!UFS.has(state)) return jsonError(res, 400, 'INVALID_STATE', 'Informe a sigla de uma UF válida.');
  if (!['6257', '6258', '6259', '6260'].includes(election)) return jsonError(res, 400, 'INVALID_ELECTION', 'Código de eleição não permitido.');
  const url = `${BASE}/oficial/ele2026/${election}/config/mun-e00${election}-cm.json`;
  try {
    const data = await cachedFetch(url, 86_400_000);
    if (!Array.isArray(data?.abr)) throw new Error('O arquivo de municípios não corresponde ao formato EA12 esperado pelo TSE.');
    const uf = data.abr.find(item => String(item?.cd || '').toLowerCase() === state);
    if (!uf || !Array.isArray(uf.mu)) return res.status(200).json({ ok: true, source: 'TSE', sourceUrl: url, state: state.toUpperCase(), municipalities: [], message: 'O TSE ainda não disponibilizou a lista de municípios para esta UF.' });
    const municipalities = uf.mu.map(m => ({ code: String(m.cd ?? '').padStart(5, '0'), ibgeCode: m.cdi == null ? null : String(m.cdi).padStart(5, '0'), name: m.nm, capital: m.c === 's' }))
      .filter(m => /^\d{5}$/.test(m.code) && m.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return res.status(200).json({ ok: true, source: 'TSE', sourceUrl: url, generatedDate: data.dg || null, generatedTime: data.hg || null, state: state.toUpperCase(), municipalities });
  } catch (err) {
    const status = Number(err.status) || 502;
    const code = status === 404 ? 'TSE_CONFIG_NOT_AVAILABLE' : 'TSE_SOURCE_ERROR';
    const message = err.message || 'Não foi possível consultar a lista oficial de municípios.';
    return jsonError(res, status === 404 ? 503 : status, code, message);
  }
};
