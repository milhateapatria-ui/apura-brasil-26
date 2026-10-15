const { urlForResults, cachedFetch, UFS } = require('./_tse');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const office = String(req.query.office || 'deputado-federal').toLowerCase();
  const state = String(req.query.state || 'pr').toLowerCase();
  const candNumber = String(req.query.number || '').trim();
  const round = String(req.query.round || '1');

  if (!candNumber) {
    return res.status(200).json({ ok: true, cities: [] });
  }

  const uf = UFS.has(state) ? state : 'pr';

  try {
    // Tenta obter a lista oficial de municípios do estado no TSE
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/6259/config/${uf}/${uf}-m.json`;
    let munData = await cachedFetch(munUrl);

    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await cachedFetch(munUrl);
    }

    const rawCities = (munData?.muni || []).filter(m => m.cd);

    if (!rawCities.length) {
      return res.status(200).json({ ok: true, cities: [] });
    }

    // Processa os municípios formatando o código para 5 dígitos
    const topCitiesResults = [];
    const citiesToFetch = rawCities.slice(0, 40); // Limita aos principais municípios para resposta rápida

    await Promise.all(
      citiesToFetch.map(async (c) => {
        try {
          const formattedCityCode = String(c.cd).padStart(5, '0');
          const url = urlForResults({ office, state: uf, city: formattedCityCode, round });
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
                        cityCode: formattedCityCode,
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

    // Ordena da cidade com MAIS votos para a com MENOS votos
    topCitiesResults.sort((a, b) => b.votes - a.votes);

    return res.status(200).json({
      ok: true,
      candidateNumber: candNumber,
      state: uf.toUpperCase(),
      cities: topCitiesResults
    });
  } catch (err) {
    return res.status(200).json({ ok: true, cities: [] });
  }
};
