const { cachedFetch, UFS } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const state = String(req.query.state || 'pr').toLowerCase();
  const uf = UFS.has(state) ? state : 'pr';

  try {
    // Busca o arquivo oficial de lista de municípios do estado
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/6259/config/${uf}/${uf}-m.json`;
    let munData = await cachedFetch(munUrl);

    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await cachedFetch(munUrl);
    }

    const cities = (munData?.muni || [])
      .filter(m => m.cd)
      .map(m => ({
        code: String(m.cd).padStart(5, '0'),
        name: m.nm
      }));

    return res.status(200).json({ ok: true, state: uf.toUpperCase(), cities });
  } catch (err) {
    return res.status(200).json({ ok: true, cities: [] });
  }
};
