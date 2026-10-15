const { urlForResults, cachedFetch, UFS } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const office = String(req.query.office || 'deputado-federal').toLowerCase();
  const state = String(req.query.state || 'sp').toLowerCase();
  const candNumber = String(req.query.number || '').trim();
  const round = String(req.query.round || '1');

  if (!UFS.has(state)) {
    return res.status(400).json({ ok: false, error: 'Estado inválido.' });
  }

  try {
    // 1. Busca lista de municípios do estado
    const munUrl = `https://resultados.tse.jus.br/oficial/ele2026/6259/config/${state}/${state}-m.json`;
    let munData = await cachedFetch(munUrl);
    
    if (!munData || !Array.isArray(munData.muni)) {
      // Fallback para estrutura de teste/2024 caso 2026 ainda não tenha a lista
      const fallbackMunUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${state}/${state}-m.json`;
      munData = await cachedFetch(fallbackMunUrl);
    }

    const cities = (munData?.muni || []).filter(m => m.cd);
    
    // 2. Consulta paralela limitada às top cidades ou amostra de municípios
    const topCitiesResults = [];

    // Processa uma amostra relevante para retorno rápido
    const citiesToFetch = cities.slice(0, 30);

    await Promise.all(
      citiesToFetch.map(async (c) => {
        try {
          const url = urlForResults({ office, state, city: c.cd, round });
          const root = await cachedFetch(url);
          if (!root || !Array.isArray(root.carg)) return;

          for (const cargo of root.carg) {
            for (const agg of (cargo.agr || [])) {
              for (const party of (agg.par || [])) {
                for (const cand of (party.cand || [])) {
                  if (String(cand.n) === candNumber) {
                    const votes = Number(String(cand.vap || 0).replace(',', '.'));
                    const percent = Number(String(cand.pvap || 0).replace(',', '.'));
                    if (votes > 0) {
                      topCitiesResults.push({
                        cityName: c.nm,
                        cityCode: c.cd,
                        votes,
                        percent
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {}
      })
    );

    // Ordena da cidade mais votada para a menos votada
    topCitiesResults.sort((a, b) => b.votes - a.votes);

    return res.status(200).json({
      ok: true,
      candidateNumber: candNumber,
      state: state.toUpperCase(),
      cities: topCitiesResults
    });
  } catch (err) {
    return res.status(200).json({ ok: true, cities: [] });
  }
};
