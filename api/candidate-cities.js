const { UFS } = require('./_tse');

const CARGO_CODES = {
  presidente: '0001',
  governador: '0003',
  senador: '0005',
  'deputado-federal': '0006',
  'deputado-estadual': '0007',
  'deputado-distrital': '0008'
};

async function fetchTse(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');
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
    // 1. Obtém a lista de municípios do estado
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/${uf}/${uf}-m.json`;
    let munData = await fetchTse(munUrl);
    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await fetchTse(munUrl);
    }

    const allMuni = (munData?.muni || []).filter(m => m.cd);
    if (!allMuni.length) {
      return res.status(200).json({ ok: true, cities: [] });
    }

    // Seleciona os principais municípios para consulta rápida e certeira
    const targetMuni = allMuni.slice(0, 30);
    const cityResults = [];

    // Consulta em paralelo controlada
    await Promise.all(
      targetMuni.map(async (m) => {
        const code = String(m.cd).padStart(5, '0');
        const urls = [
          `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}${code}-c${cCode}-e00${election}-u.json`,
          `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${code}-c${cCode}-e000306-u.json`,
          `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${code}-c${cCode}-e000306-v.json`
        ];

        for (const url of urls) {
          const root = await fetchTse(url);
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
                        cityName: m.nm,
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
      })
    );

    // ORDENAÇÃO DECRESCENTE RIGOROSA: do município com MAIS votos para o com MENOS votos
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
