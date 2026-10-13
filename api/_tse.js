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
const TTL = 20_000;

function jsonError(res, status, code, message) {
  return res.status(status).json({ ok: false, error: { code, message }, source: 'TSE', updatedAt: null });
}
function cachedFetch(url, ttl = TTL) {
  const now = Date.now();
  const found = cache.get(url);
  if (found && now - found.at < ttl) return Promise.resolve(found.value);
  return fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    .then(async r => {
      if (!r.ok) {
        const err = new Error(r.status === 404 ? 'Arquivo oficial ainda não disponível para este recorte.' : `O TSE respondeu HTTP ${r.status}.`);
        err.status = r.status;
        throw err;
      }
      const value = await r.json();
      cache.set(url, { at: now, value });
      return value;
    });
}
function urlForResults({ office, state, city, round = '1' }) {
  const cfg = CARGO[office];
  if (!cfg) throw Object.assign(new Error('Cargo inválido.'), { status: 400 });
  if (!['1', '2'].includes(String(round))) throw Object.assign(new Error('Turno inválido.'), { status: 400 });
  if (String(round) === '2' && !cfg.secondElection) throw Object.assign(new Error('Este cargo não possui consulta de segundo turno nesta integração.'), { status: 400 });
  const election = String(round) === '2' ? cfg.secondElection : cfg.firstElection;
  const uf = String(state || '').toLowerCase();
  if (office !== 'presidente' && !UFS.has(uf)) throw Object.assign(new Error('Selecione uma UF válida para este cargo.'), { status: 400 });
  let folder, filename;
  if (city) {
    if (!UFS.has(uf) || !/^\d{5}$/.test(String(city))) throw Object.assign(new Error('Código de município inválido.'), { status: 400 });
    folder = uf;
    filename = `${uf}${city}-c${cfg.code}-e00${election}-u.json`;
  } else if (office === 'presidente' && (!uf || uf === 'br')) {
    folder = 'br';
    filename = `br-c${cfg.code}-e00${election}-u.json`;
  } else {
    if (!UFS.has(uf)) throw Object.assign(new Error('Selecione uma UF válida.'), { status: 400 });
    folder = uf;
    filename = `${uf}-c${cfg.code}-e00${election}-u.json`;
  }
  return `${BASE}/oficial/ele2026/${election}/dados/${folder}/${filename}`;
}
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
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
            number: cand?.n == null ? null : String(cand.n),
            name: cand?.nmu || cand?.nm || 'Nome não informado pelo TSE',
            fullName: cand?.nm || null,
            party: party?.sg || agg?.sg || null,
            partyName: party?.nm || agg?.nm || null,
            votes: toNumber(cand?.vap),
            percent: toNumber(cand?.pvap),
            status: cand?.st || null,
            elected: cand?.e === 's'
          });
        }
      }
    }
  }
  // Avoid duplicate candidate entries if the same candidate is repeated by nested aggregates.
  const unique = new Map();
  for (const c of out) {
    const key = `${c.number ?? ''}|${c.fullName ?? c.name}|${c.party ?? ''}`;
    if (!unique.has(key) || (c.votes ?? -1) > (unique.get(key).votes ?? -1)) unique.set(key, c);
  }
  return [...unique.values()].sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1));
}
function normalize(root, url) {
  if (!root || typeof root !== 'object' || !Array.isArray(root.carg)) {
    throw Object.assign(new Error('O arquivo retornado não corresponde ao formato EA20 esperado pelo TSE.'), { status: 502 });
  }
  if (root.f && root.f !== 'o') {
    throw Object.assign(new Error('A fonte retornou dados que não estão identificados como oficiais. Eles não serão exibidos.'), { status: 502 });
  }
  const candidates = extractCandidates(root);
  const sectionsTotal = toNumber(root?.s?.ts);
  const sectionsCounted = toNumber(root?.s?.st);
  const sectionsPercent = sectionsTotal && sectionsCounted !== null ? sectionsCounted / sectionsTotal * 100 : null;
  return {
    ok: true,
    source: 'TSE',
    sourceUrl: url,
    sourceType: 'EA20',
    electionCode: root.ele ?? null,
    round: toNumber(root.t),
    phase: root.f === 'o' ? 'oficial' : 'não confirmada',
    generatedDate: root.dg ?? null,
    generatedTime: root.hg ?? null,
    totalizationDate: root.dt ?? null,
    totalizationTime: root.ht ?? null,
    totalizationStatus: root.and ?? null,
    finalTotalization: root.tf === 's',
    sections: { total: sectionsTotal, counted: sectionsCounted, percent: sectionsPercent },
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
    message: candidates.length ? null : 'O TSE ainda não disponibilizou votação para este cargo e recorte.'
  };
}
module.exports = { BASE, CARGO, UFS, cachedFetch, jsonError, urlForResults, normalize };
