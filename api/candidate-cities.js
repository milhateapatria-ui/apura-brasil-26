const { UFS } = require('./_tse');

const TOP_CITIES_BY_UF = {
  pr: [
    { code: '07579', name: 'Curitiba' },
    { code: '07538', name: 'Londrina' },
    { code: '07554', name: 'Maringá' },
    { code: '07757', name: 'Ponta Grossa' },
    { code: '07473', name: 'Cascavel' },
    { code: '07511', name: 'Foz do Iguaçu' },
    { code: '07838', name: 'São José dos Pinhais' },
    { code: '07490', name: 'Colombo' },
    { code: '07546', name: 'Guarapuava' },
    { code: '07730', name: 'Paranaguá' },
    { code: '07430', name: 'Araucária' },
    { code: '07854', name: 'Toledo' },
    { code: '07414', name: 'Apucarana' },
    { code: '07457', name: 'Campo Largo' },
    { code: '07870', name: 'Umuarama' }
  ],
  sp: [
    { code: '71072', name: 'São Paulo' },
    { code: '63231', name: 'Campinas' },
    { code: '64777', name: 'Guarulhos' },
    { code: '70750', name: 'São Bernardo do Campo' },
    { code: '70211', name: 'Santo André' },
    { code: '69256', name: 'Ribeirão Preto' },
    { code: '71358', name: 'Sorocaba' },
    { code: '68616', name: 'Osasco' },
    { code: '70475', name: 'São José dos Campos' },
    { code: '69833', name: 'São José do Rio Preto' }
  ]
};

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
      signal: AbortSignal.timeout(4000)
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

  if (!candNumber) {
    return res.status(200).json({ ok: true, cities: [] });
  }

  const uf = UFS.has(state) ? state : 'pr';
  const cCode = CARGO_CODES[office] || '0006';

  let targetCities = TOP_CITIES_BY_UF[uf];

  if (!targetCities) {
    const munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
    const munData = await fetchTse(munUrl);
    targetCities = (munData?.muni || []).slice(0, 15).map(m => ({
      code: String(m.cd).padStart(5, '0'),
      name: m.nm
    }));
  }

  const cityResults = [];

  await Promise.all(
    targetCities.map(async (city) => {
      // Testa URLs oficiais do TSE para 2026 e fallback 2024
      const urls = [
        `https://resultados.tse.jus.br/oficial/ele2026/6259/dados/${uf}/${uf}${city.code}-c${cCode}-e006259-u.json`,
        `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${city.code}-c${cCode}-e000306-u.json`,
        `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${city.code}-c${cCode}-e000306-v.json`
      ];

      for (const url of urls) {
        const root = await fetchTse(url);
        if (!root || !Array.isArray(root.carg)) continue;

        let foundInCity = false;
        for (const cargo of root.carg) {
          for (const agg of (cargo.agr || [])) {
            for (const party of (agg.par || [])) {
              for (const cand of (party.cand || [])) {
                if (String(cand.n) === candNumber) {
                  const votes = Number(String(cand.vap || 0).replace(',', '.'));
                  const percent = Number(String(cand.pvap || 0).replace(',', '.'));
                  if (votes > 0) {
                    cityResults.push({
                      cityName: city.name,
                      votes,
                      percent
                    });
                    foundInCity = true;
                    break;
                  }
                }
              }
              if (foundInCity) break;
            }
            if (foundInCity) break;
          }
          if (foundInCity) break;
        }
        if (foundInCity) break;
      }
    })
  );

  // Ordena rigorosamente do município com MAIS votos para o com MENOS votos
  cityResults.sort((a, b) => b.votes - a.votes);

  return res.status(200).json({
    ok: true,
    candidateNumber: candNumber,
    state: uf.toUpperCase(),
    cities: cityResults
  });
};
