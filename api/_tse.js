const BASE = 'https://resultados.tse.jus.br';

const CARGO = Object.freeze({
  presidente: { code: '0001', firstElection: '6257', secondElection: '6258', scope: 'br' },
  governador: { code: '0003', firstElection: '6259', secondElection: '6260', scope: 'uf' },
  senador: { code: '0005', firstElection: '6259', scope: 'uf' },
  'deputado-federal': { code: '0006', firstElection: '6259', scope: 'uf' },
  'deputado-estadual': { code: '0007', firstElection: '6259', scope: 'uf' },
  'deputado-distrital': { code: '0008', firstElection: '6259', scope: 'uf' }
});

const UFS = new Set('ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' '));
const cache = new Map();
const TTL = 15_000;

function jsonError(res, status, code, message) {
  return res.status(status).json({ ok: false, error: { code, message }, source: 'TSE', updatedAt: new Date().toISOString() });
}

async function cachedFetch(url, ttl = TTL) {
  const now = Date.now();
  const found = cache.get(url);
  if (found && now - found.at < ttl) return found.value;

  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      cache.set(url, { at: now, value: data });
      return data;
    }
  } catch (e) {
    // Falha de rede ou timeout
  }

  // Tenta recuperar do cache mesmo que expirado em caso de erro na rede
  if (found) return found.value;
  return null;
}

function urlForResults({ office, state, city, round = '1' }) {
  const cfg = CARGO[office] || CARGO.presidente;
  const election = String(round) === '2' ? (cfg.secondElection || cfg.firstElection) : cfg.firstElection;
  const uf = String(state || '').toLowerCase();

  let folder = 'br';
  let filename = `br-c${cfg.code}-e00${election}-u.json`;

  if (office !== 'presidente' || (uf && uf !== 'br')) {
    folder = UFS.has(uf) ? uf : 'sp';
    filename = `${folder}-c${cfg.code}-e00${election}-u.json`;
  }

  if (city && /^\d{5}$/.test(String(city))) {
    filename = `${folder}${city}-c${cfg.code}-e00${election}-u.json`;
  }

  return `${BASE}/oficial/ele2026/${election}/dados/${folder}/${filename}`;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function extractCandidates(root) {
  const cargos = Array.isArray(root?.carg) ? root.carg : [];
  const out = [];

  for (const cargo of cargos) {
    const aggs = Array.isArray(cargo?.agr) ? cargo.agr : [];
    for (const agg of aggs) {
      const parties = Array.isArray(agg?.par) ? agg.par : [];
      for (const party of parties) {
        for (const cand of (Array.isArray(party?.cand) ? party.cand : [])) {
          out.push({
            sqcand: cand?.sqcand || cand?.n || '',
            number: cand?.n ? String(cand.n) : '',
            name: cand?.nmu || cand?.nm || 'Candidato',
            fullName: cand?.nm || '',
            party: party?.sg || agg?.sg || '',
            partyName: party?.nm || agg?.nm || '',
            votes: toNumber(cand?.vap),
            percent: toNumber(cand?.pvap),
            status: cand?.st || '',
            elected: cand?.e === 's'
          });
        }
      }
    }
  }

  const unique = new Map();
  for (const c of out) {
    const key = `${c.number}|${c.name}`;
    if (!unique.has(key) || c.votes > unique.get(key).votes) {
      unique.set(key, c);
    }
  }

  return [...unique.values()].sort((a, b) => b.votes - a.votes);
}

function normalize(root, url) {
  if (!root) {
    // Retorno estruturado quando os arquivos ainda não foram gerados no portal
    return {
      ok: true,
      phase: 'oficial',
      source: 'TSE',
      sourceUrl: url,
      generatedDate: new Date().toLocaleDateString('pt-BR'),
      generatedTime: new Date().toLocaleTimeString('pt-BR'),
      totalizationStatus: 'n',
      sections: { total: 0, counted: 0, percent: 0 },
      voters: { total: 0, counted: 0, turnout: 0, abstentions: 0 },
      votes: { total: 0, valid: 0, nominal: 0, blank: 0, null: 0 },
      candidates: [],
      message: 'Aguardando publicação dos dados oficiais pelo TSE para este cargo e localidade.'
    };
  }

  const candidates = extractCandidates(root);
  const sectionsTotal = toNumber(root?.s?.ts);
  const sectionsCounted = toNumber(root?.s?.st);

  return {
    ok: true,
    phase: 'oficial',
    source: 'TSE',
    sourceUrl: url,
    generatedDate: root.dg || new Date().toLocaleDateString('pt-BR'),
    generatedTime: root.hg || new Date().toLocaleTimeString('pt-BR'),
    totalizationDate: root.dt || null,
    totalizationTime: root.ht || null,
    totalizationStatus: root.and || 'f',
    sections: {
      total: sectionsTotal,
      counted: sectionsCounted,
      percent: sectionsTotal > 0 ? (sectionsCounted / sectionsTotal) * 100 : 0
    },
    voters: {
      total: toNumber(root?.e?.te),
      counted: toNumber(root?.e?.est),
      turnout: toNumber(root?.e?.c),
      abstentions: toNumber(root?.e?.a)
    },
    votes: {
      total: toNumber(root?.v?.tv),
      valid: toNumber(root?.v?.vv),
      nominal: toNumber(root?.v?.vnom),
      blank: toNumber(root?.v?.vb),
      null: toNumber(root?.v?.vn)
    },
    candidates,
    message: candidates.length ? null : 'Nenhum resultado publicado até o momento pelo TSE.'
  };
}

module.exports = { BASE, CARGO, UFS, cachedFetch, jsonError, urlForResults, normalize };
