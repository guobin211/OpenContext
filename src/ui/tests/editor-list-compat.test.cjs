/**
 * Tests for editor/normalize/listCompatNormalize.js
 *
 * These tests verify the helper functions used by the normalize logic.
 * Note: Full integration tests require a running Plate editor which is not
 * practical in a Node.js test environment. These unit tests focus on the
 * pure utility functions.
 */

const { describe, it, before } = require('node:test');
const { strictEqual } = require('node:assert');

// Hold imported modules
let nodeTypes;

describe('nodeTypes helpers', async () => {
  // Load ESM module before tests
  before(async () => {
    nodeTypes = await import('../src/editor/nodeTypes.js');
  });

  // Mock types for testing
  const mockTypes = {
    ul: 'ul',
    ol: 'ol',
    taskList: 'taskList',
    li: 'li',
    lic: 'lic',
    codeBlock: 'code_block',
    p: 'p',
  };

  describe('getListStart', () => {
    it('returns 1 for undefined/null', () => {
      strictEqual(nodeTypes.getListStart(undefined), 1);
      strictEqual(nodeTypes.getListStart(null), 1);
      strictEqual(nodeTypes.getListStart({}), 1);
    });

    it('returns start property when present', () => {
      strictEqual(nodeTypes.getListStart({ start: 5 }), 5);
    });

    it('returns listStart property as fallback', () => {
      strictEqual(nodeTypes.getListStart({ listStart: 3 }), 3);
    });

    it('prefers start over listStart', () => {
      strictEqual(nodeTypes.getListStart({ start: 7, listStart: 2 }), 7);
    });
  });

  describe('countListItems', () => {
    it('returns 0 for empty node', () => {
      strictEqual(nodeTypes.countListItems({}, mockTypes), 0);
      strictEqual(nodeTypes.countListItems({ children: [] }, mockTypes), 0);
    });

    it('counts li children', () => {
      const node = {
        children: [
          { type: 'li', children: [] },
          { type: 'li', children: [] },
          { type: 'other', children: [] },
        ],
      };
      strictEqual(nodeTypes.countListItems(node, mockTypes), 2);
    });
  });

  describe('isListContainer', () => {
    it('returns true for ul/ol/taskList', () => {
      strictEqual(nodeTypes.isListContainer({ type: 'ul' }, mockTypes), true);
      strictEqual(nodeTypes.isListContainer({ type: 'ol' }, mockTypes), true);
      strictEqual(nodeTypes.isListContainer({ type: 'taskList' }, mockTypes), true);
    });

    it('returns false for other types', () => {
      strictEqual(nodeTypes.isListContainer({ type: 'p' }, mockTypes), false);
      strictEqual(nodeTypes.isListContainer({ type: 'li' }, mockTypes), false);
      strictEqual(nodeTypes.isListContainer({}, mockTypes), false);
    });
  });

  describe('isOrderedList', () => {
    it('returns true only for ol', () => {
      strictEqual(nodeTypes.isOrderedList({ type: 'ol' }, mockTypes), true);
      strictEqual(nodeTypes.isOrderedList({ type: 'ul' }, mockTypes), false);
      strictEqual(nodeTypes.isOrderedList({ type: 'taskList' }, mockTypes), false);
    });
  });

  describe('isUnorderedList', () => {
    it('returns true only for ul', () => {
      strictEqual(nodeTypes.isUnorderedList({ type: 'ul' }, mockTypes), true);
      strictEqual(nodeTypes.isUnorderedList({ type: 'ol' }, mockTypes), false);
      strictEqual(nodeTypes.isUnorderedList({ type: 'taskList' }, mockTypes), false);
    });
  });

  describe('isTaskList', () => {
    it('returns true only for taskList', () => {
      strictEqual(nodeTypes.isTaskList({ type: 'taskList' }, mockTypes), true);
      strictEqual(nodeTypes.isTaskList({ type: 'ul' }, mockTypes), false);
      strictEqual(nodeTypes.isTaskList({ type: 'ol' }, mockTypes), false);
    });
  });
});

describe('List continuation calculation', () => {
  /**
   * Test the logic for calculating the expected start of a continuation list.
   * This is extracted from the normalize function for unit testing.
   */
  function calculateContinuationStart(firstListStart, firstListItemCount) {
    const baseStart = Number.isFinite(firstListStart) ? firstListStart : 1;
    return baseStart + firstListItemCount;
  }

  it('calculates simple continuation', () => {
    // List starting at 1 with 3 items -> next should start at 4
    strictEqual(calculateContinuationStart(1, 3), 4);
  });

  it('calculates continuation from non-1 start', () => {
    // List starting at 5 with 2 items -> next should start at 7
    strictEqual(calculateContinuationStart(5, 2), 7);
  });

  it('handles missing start (defaults to 1)', () => {
    // No start means default to 1
    strictEqual(calculateContinuationStart(undefined, 3), 4);
    strictEqual(calculateContinuationStart(null, 3), 4);
  });

  it('handles zero items', () => {
    strictEqual(calculateContinuationStart(1, 0), 1);
    strictEqual(calculateContinuationStart(5, 0), 5);
  });
});
