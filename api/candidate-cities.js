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
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

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
  const cCode = CARGO_CODES[office] || '0006';
  const election = round === '2' ? '6260' : '6259';

  try {
    // 1. Carrega o dicionário de nomes dos municípios do estado
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/${uf}/${uf}-m.json`;
    let munData = await fetchTse(munUrl);
    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await fetchTse(munUrl);
    }

    const cityNamesMap = new Map();
    (munData?.muni || []).forEach(m => {
      if (m.cd) cityNamesMap.set(String(m.cd).padStart(5, '0'), m.nm);
    });

    // 2. Tenta carregar o arquivo consolidado de resultados do estado ou de teste 2024
    let detailUrls = [
      `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}-c${cCode}-e00${election}-u.json`,
      `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}-c${cCode}-e000306-u.json`,
      `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}-c${cCode}-e000306-v.json`
    ];

    let root = null;
    for (const url of detailUrls) {
      root = await fetchTse(url);
      if (root && Array.isArray(root.carg)) break;
    }

    const cityResults = [];

    if (root && Array.isArray(root.carg)) {
      for (const cargo of root.carg) {
        for (const agg of (cargo.agr || [])) {
          for (const party of (agg.par || [])) {
            for (const cand of (party.cand || [])) {
              if (String(cand.n) === candNumber) {
                // Processa a lista de municípios presente no objeto do candidato
                if (Array.isArray(cand.mun)) {
                  for (const m of cand.mun) {
                    const code = String(m.cd || m.codigo || '').padStart(5, '0');
                    const votes = Number(String(m.vap || m.votos || 0).replace(',', '.'));
                    const percent = Number(String(m.pvap || 0).replace(',', '.'));
                    if (votes > 0) {
                      cityResults.push({
                        cityName: cityNamesMap.get(code) || `Município ${code}`,
                        votes,
                        percent
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Ordena do maior para o menor número de votos
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
