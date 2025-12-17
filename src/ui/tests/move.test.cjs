const test = require('node:test');
const assert = require('node:assert/strict');

// Import ESM from CJS via dynamic import()
const importMove = async () => import('../src/services/move.js');

test('rewriteExpandedFolders rewrites prefix and keeps target expanded', async () => {
  const { rewriteExpandedFolders } = await importMove();
  const prev = new Set(['a', 'a/b', 'x', 'a/b/c']);
  const next = rewriteExpandedFolders(prev, 'a', 'z', 'dest');
  assert.equal(next.has('z'), true);
  assert.equal(next.has('z/b'), true);
  assert.equal(next.has('z/b/c'), true);
  assert.equal(next.has('x'), true);
  assert.equal(next.has('dest'), true);
});

test('rewriteSelectedDocAfterFolderMove rewrites selectedDoc rel_path under moved folder', async () => {
  const { rewriteSelectedDocAfterFolderMove } = await importMove();
  const doc = { rel_path: 'a/b/doc.md' };
  const out = rewriteSelectedDocAfterFolderMove(doc, 'a', 'z');
  assert.equal(out.rel_path, 'z/b/doc.md');
});


