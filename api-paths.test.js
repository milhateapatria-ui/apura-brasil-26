const test = require('node:test');
const assert = require('node:assert/strict');
const { urlForResults } = require('./api/_tse');

test('presidente Brasil usa eleição federal e código de cargo documentados', () => {
  assert.equal(urlForResults({ office: 'presidente', state: 'br' }), 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json');
  assert.equal(urlForResults({ office: 'presidente', state: 'br', round: '2' }), 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json');
});
test('governador estadual usa eleição estadual', () => {
  assert.equal(urlForResults({ office: 'governador', state: 'pr' }), 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/pr/pr-c0003-e006259-u.json');
  assert.equal(urlForResults({ office: 'governador', state: 'pr', round: '2' }), 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/pr/pr-c0003-e006260-u.json');
});
test('município mantém código TSE de cinco dígitos', () => {
  assert.equal(urlForResults({ office: 'senador', state: 'pr', city: '01234' }), 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/pr/pr01234-c0005-e006259-u.json');
});
test('rejeita cargo estadual sem UF válida', () => {
  assert.throws(() => urlForResults({ office: 'governador', state: 'br' }), /UF válida/);
});
test('rejeita segundo turno para deputado', () => {
  assert.throws(() => urlForResults({ office: 'deputado-federal', state: 'pr', round: '2' }), /não possui consulta de segundo turno/);
});
test('rejeita código municipal inválido', () => {
  assert.throws(() => urlForResults({ office: 'senador', state: 'pr', city: '123' }), /município inválido/);
});
