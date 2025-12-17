const test = require('node:test');
const assert = require('node:assert/strict');

const importScrollSpy = async () => import('../src/hooks/useScrollSpy.js');

test('pickActiveHeadingId selects the last heading whose top <= scrollTop+offset', async () => {
  const { pickActiveHeadingId } = await importScrollSpy();
  const headings = [
    { id: 'a', top: 0 },
    { id: 'b', top: 100 },
    { id: 'c', top: 250 },
  ];

  assert.equal(pickActiveHeadingId(headings, 0, 0), 'a');
  assert.equal(pickActiveHeadingId(headings, 100, 0), 'b');
  assert.equal(pickActiveHeadingId(headings, 250, 0), 'c');
  assert.equal(pickActiveHeadingId(headings, -10, 0), '');
});


