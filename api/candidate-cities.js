const { cachedFetch, UFS } = require('./_tse');

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
  const election = round === '2' ? '6260' : '6259';

  try {
    // Busca a lista com os nomes de todos os municípios do estado
    let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/${uf}/${uf}-m.json`;
    let munData = await cachedFetch(munUrl);

    if (!munData || !Array.isArray(munData.muni)) {
      munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
      munData = await cachedFetch(munUrl);
    }

    const cityMap = new Map();
    (munData?.muni || []).forEach(m => {
      if (m.cd) cityMap.set(String(m.cd).padStart(5, '0'), m.nm);
    });

    // Código do cargo conforme convenção TSE
    const cargoCodes = {
      presidente: '0001',
      governador: '0003',
      senador: '0005',
      'deputado-federal': '0006',
      'deputado-estadual': '0007',
      'deputado-distrital': '0008'
    };
    const cCode = cargoCodes[office] || '0006';

    // Tenta carregar o relatório detalhado por municípios do TSE para este estado
    let detailUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}-c${cCode}-e00${election}-u.json`;
    let root = await cachedFetch(detailUrl);

    if (!root) {
      detailUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}-c${cCode}-e00306-u.json`;
      root = await cachedFetch(detailUrl);
    }

    const cityVotes = [];

    if (root && Array.isArray(root.carg)) {
      for (const cargo of root.carg) {
        for (const agg of (cargo.agr || [])) {
          for (const party of (agg.par || [])) {
            for (const cand of (party.cand || [])) {
              if (String(cand.n) === candNumber) {
                // Se houver divisão por município no nó 'mun'
                if (Array.isArray(cand.mun)) {
                  for (const m of cand.mun) {
                    const cCodeFormatted = String(m.cd).padStart(5, '0');
                    const votes = Number(String(m.vap || 0).replace(',', '.'));
                    const percent = Number(String(m.pvap || 0).replace(',', '.'));
                    if (votes > 0) {
                      cityVotes.push({
                        cityName: cityMap.get(cCodeFormatted) || `Município ${cCodeFormatted}`,
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

    // Ordena da cidade com mais votos para a com menos votos
    cityVotes.sort((a, b) => b.votes - a.votes);

    return res.status(200).json({
      ok: true,
      candidateNumber: candNumber,
      state: uf.toUpperCase(),
      cities: cityVotes
    });
  } catch (err) {
    return res.status(200).json({ ok: true, cities: [] });
  }
};
