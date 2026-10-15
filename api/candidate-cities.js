const { cachedFetch, UFS } = require('./_tse');

const CARGO_CODES = {
  presidente: '0001',
  governador: '0003',
  senador: '0005',
  'deputado-federal': '0006',
  'deputado-estadual': '0007',
  'deputado-distrital': '0008'
};

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

  if (!candNumber || !UFS.has(state)) {
    return res.status(200).json({ ok: true, cities: [] });
  }

  const uf = state;
  const cCode = CARGO_CODES[office] || '0006';
  const election = round === '2' ? '6260' : '6259';

  try {
    // 1. Busca lista oficial de municípios do estado no TSE
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/${uf}/${uf}-m.json`;
    let munData = await cachedFetch(munUrl);

    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await cachedFetch(munUrl);
    }

    const cities = (munData?.muni || []).filter(m => m.cd);
    if (!cities.length) {
      return res.status(200).json({ ok: true, cities: [] });
    }

    // Consulta amostra dos principais municípios do estado
    const cityResults = [];
    const targetCities = cities.slice(0, 35);

    await Promise.all(
      targetCities.map(async (c) => {
        try {
          const formattedCode = String(c.cd).padStart(5, '0');
          const urls = [
            `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}${formattedCode}-c${cCode}-e00${election}-u.json`,
            `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${formattedCode}-c${cCode}-e000306-u.json`,
            `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${formattedCode}-c${cCode}-e000306-v.json`
          ];

          for (const url of urls) {
            const root = await cachedFetch(url);
            if (!root || !Array.isArray(root.carg)) continue;

            let found = false;
            for (const cargo of root.carg) {
              for (const agg of (cargo.agr || [])) {
                for (const party of (agg.par || [])) {
                  for (const cand of (party.cand || [])) {
                    if (String(cand.n) === candNumber) {
                      const votes = Number(String(cand.vap || 0).replace(',', '.'));
                      const percent = Number(String(cand.pvap || 0).replace(',', '.'));
                      if (votes > 0) {
                        cityResults.push({
                          cityName: c.nm,
                          votes,
                          percent
                        });
                        found = true;
                        break;
                      }
                    }
                  }
                  if (found) break;
                }
                if (found) break;
              }
              if (found) break;
            }
            if (found) break;
          }
        } catch (e) {}
      })
    );

    // Ordena rigorosamente da cidade com mais votos reais para a com menos
    cityResults.sort((a, b) => b.votes - a.votes);

    return res.status(200).json({
      ok: true,
      candidateNumber: candNumber,
      state: uf.toUpperCase(),
      cities: cityResults
    });
  } catch (err) {
    return res.status(200).json({ ok: true, cities: [] });
  }
};
