const { cachedFetch, urlForResults, normalize } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=10');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const office = String(req.query.office || 'presidente').toLowerCase();
  const state = String(req.query.state || 'br').toLowerCase();
  const city = req.query.city ? String(req.query.city) : null;
  const round = String(req.query.round || '1');

  try {
    const url = urlForResults({ office, state, city, round });
    const root = await cachedFetch(url);
    const data = normalize(root, url);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({
      ok: true,
      phase: 'oficial',
      source: 'TSE',
      sourceUrl: 'https://resultados.tse.jus.br',
      totalizationStatus: 'n',
      sections: { total: 0, counted: 0, percent: 0 },
      voters: { total: 0, counted: 0, turnout: 0, abstentions: 0 },
      votes: { total: 0, valid: 0, nominal: 0, blank: 0, null: 0 },
      candidates: [],
      message: 'Aguardando início da apuração pelo TSE.'
    });
  }
};
