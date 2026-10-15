const { cachedFetch, UFS } = require('./_tse');

// Mapeamento dos principais colégios eleitorais por estado para consulta rápida e garantida
const TOP_CITIES_BY_UF = {
  pr: [
    { code: '07579', name: 'Curitiba' },
    { code: '07538', name: 'Londrina' },
    { code: '07554', name: 'Maringá' },
    { code: '07757', name: 'Ponta Grossa' },
    { code: '07473', name: 'Cascavel' },
    { code: '07511', name: 'Foz do Iguaçu' },
    { code: '07838', name: 'São José dos Pinhais' },
    { code: '07490', name: 'ColOMBO' },
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
    { code: '69833', name: 'S. José do Rio Preto' }
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

  // Obtém as cidades do mapa ou uma amostra caso não esteja mapeado
  let targetCities = TOP_CITIES_BY_UF[uf];

  if (!targetCities) {
    try {
      let munUrl = `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/${uf}/${uf}-m.json`;
      let munData = await cachedFetch(munUrl);
      if (!munData || !Array.isArray(munData.muni)) {
        munUrl = `https://resultados.tse.jus.br/oficial/ele2024/306/config/${uf}/${uf}-m.json`;
        munData = await cachedFetch(munUrl);
      }
      targetCities = (munData?.muni || []).slice(0, 15).map(m => ({
        code: String(m.cd).padStart(5, '0'),
        name: m.nm
      }));
    } catch (e) {
      targetCities = [];
    }
  }

  const cityResults = [];

  // Executa busca paralela otimizada nas cidades selecionadas
  await Promise.all(
    targetCities.map(async (city) => {
      try {
        let url = `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}${city.code}-c${cCode}-e00${election}-u.json`;
        let root = await cachedFetch(url);

        if (!root) {
          url = `https://resultados.tse.jus.br/oficial/ele2024/306/dados/${uf}/${uf}${city.code}-c${cCode}-e00306-u.json`;
          root = await cachedFetch(url);
        }

        if (!root || !Array.isArray(root.carg)) return;

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
                  }
                }
              }
            }
          }
        }
      } catch (err) {}
    })
  );

  // Ordena rigorosamente do MAIOR número de votos para o MENOR
  cityResults.sort((a, b) => b.votes - a.votes);

  return res.status(200).json({
    ok: true,
    candidateNumber: candNumber,
    state: uf.toUpperCase(),
    cities: cityResults
  });
};
