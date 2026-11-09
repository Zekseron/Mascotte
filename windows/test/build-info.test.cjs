'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, read } = require('../lib/build-info.cjs');
const sha = 'a'.repeat(40);

test('build: distingue il commit pulito dalle modifiche locali senza conservare percorsi', () => {
  const run = dirty => (_command, args) => args[0] === 'rev-parse' ? sha + '\n' : dirty;
  assert.deepEqual(collect('.', run('')), { revision: sha, modified: false });
  assert.deepEqual(collect('.', run(' M windows/main.cjs\n')), { revision: sha, modified: true });
});
test('build: Git assente o dati non validi non impediscono l’avvio', () => {
  assert.equal(collect('.', () => { throw new Error('Git assente'); }), null);
  assert.equal(collect('.', () => 'contenuto inatteso'), null);
  assert.equal(read(__filename + '.inesistente'), null);
});
