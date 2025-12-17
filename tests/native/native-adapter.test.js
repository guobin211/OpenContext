/**
 * Native Adapter Tests
 * 
 * Tests for the Native (Rust) bindings adapter.
 */

const { describe, it, before, assert } = require('../helpers');
const { 
  isNativeAvailable, 
  getNativeError, 
  NativeSearcher, 
  NativeIndexer 
} = require('../../src/core/search/native-adapter');

describe('Native Adapter', async () => {

  describe('isNativeAvailable()', () => {
    it('should return boolean', () => {
      const result = isNativeAvailable();
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('getNativeError()', () => {
    it('should return null or Error', () => {
      const error = getNativeError();
      assert.ok(error === null || error instanceof Error);
    });
  });

  // Skip native tests if native bindings are not available
  const nativeAvailable = isNativeAvailable();
  
  describe('NativeSearcher', { skip: !nativeAvailable }, async () => {
    let searcher;

    before(async () => {
      searcher = new NativeSearcher();
    });

    it('should create instance with default options', () => {
      const s = new NativeSearcher();
      assert.strictEqual(s.vectorWeight, 0.7);
      assert.strictEqual(s.keywordWeight, 0.3);
      assert.strictEqual(s.initialized, false);
    });

    it('should accept custom options', () => {
      const s = new NativeSearcher({ vectorWeight: 0.8, keywordWeight: 0.2 });
      assert.strictEqual(s.vectorWeight, 0.8);
      assert.strictEqual(s.keywordWeight, 0.2);
    });

    it('should initialize successfully', async () => {
      await searcher.initialize();
      assert.strictEqual(searcher.initialized, true);
    });

    it('should not re-initialize by default', async () => {
      const s = new NativeSearcher();
      await s.initialize();
      const firstSearcher = s._searcher;
      await s.initialize();
      assert.strictEqual(s._searcher, firstSearcher, 'Should be same instance');
    });

    it('should force re-initialize when requested', async () => {
      const s = new NativeSearcher();
      await s.initialize();
      await s.initialize(true);
      assert.strictEqual(s.initialized, true);
    });

    describe('search()', { skip: !nativeAvailable }, async () => {
      it('should return array of results', async () => {
        const results = await searcher.search('test', { limit: 5 });
        assert.ok(Array.isArray(results));
      });

      it('should return results with snake_case fields', async () => {
        const results = await searcher.search('context', { limit: 1 });
        if (results.length > 0) {
          const r = results[0];
          assert.ok('file_path' in r, 'Should have file_path');
          assert.ok('score' in r, 'Should have score');
          assert.ok('matched_by' in r, 'Should have matched_by');
        }
      });

      it('should respect limit option', async () => {
        const results = await searcher.search('test', { limit: 3 });
        assert.ok(results.length <= 3);
      });

      it('should support different modes', async () => {
        const modes = ['hybrid', 'vector', 'keyword'];
        for (const mode of modes) {
          const results = await searcher.search('test', { mode, limit: 1 });
          assert.ok(Array.isArray(results), `Mode ${mode} should return array`);
        }
      });

      it('should support different aggregation types', async () => {
        const types = ['content', 'doc', 'folder'];
        for (const aggregateBy of types) {
          const results = await searcher.search('test', { aggregateBy, limit: 1 });
          assert.ok(Array.isArray(results), `AggregateBy ${aggregateBy} should return array`);
        }
      });
    });

    describe('formatResultsPlain()', () => {
      it('should return string', () => {
        const results = [{ score: 0.5, file_path: 'test.md', matched_by: 'hybrid' }];
        const output = searcher.formatResultsPlain('test', results);
        assert.strictEqual(typeof output, 'string');
      });

      it('should include query in output', () => {
        const output = searcher.formatResultsPlain('my query', []);
        assert.ok(output.includes('my query'));
      });
    });

    describe('formatResultsJson()', () => {
      it('should return object with correct structure', () => {
        const results = [{ score: 0.5, file_path: 'test.md', matched_by: 'hybrid' }];
        const output = searcher.formatResultsJson('test', results, { mode: 'hybrid' });
        
        assert.strictEqual(output.query, 'test');
        assert.strictEqual(output.mode, 'hybrid');
        assert.ok(Array.isArray(output.results));
        assert.strictEqual(output.count, 1);
      });
    });
  });

  describe('NativeIndexer', { skip: !nativeAvailable }, async () => {
    let indexer;

    before(async () => {
      indexer = new NativeIndexer();
    });

    it('should create instance', () => {
      const i = new NativeIndexer();
      assert.strictEqual(i.initialized, false);
    });

    it('should initialize successfully', async () => {
      await indexer.initialize();
      assert.strictEqual(indexer.initialized, true);
    });

    describe('indexExists()', { skip: !nativeAvailable }, async () => {
      it('should return boolean', async () => {
        const exists = await indexer.indexExists();
        assert.strictEqual(typeof exists, 'boolean');
      });
    });

    describe('getStats()', { skip: !nativeAvailable }, async () => {
      it('should return stats object', async () => {
        const stats = await indexer.getStats();
        assert.strictEqual(typeof stats, 'object');
        assert.ok('totalChunks' in stats || 'total_chunks' in stats);
      });
    });
  });
});

