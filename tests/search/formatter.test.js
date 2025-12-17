/**
 * Formatter Module Tests
 */

const { describe, it, assert } = require('../helpers');
const { normalizeResult, normalizeResults, formatPlain, formatJson } = require('../../src/core/search/formatter');

describe('Search Formatter', async () => {
  
  describe('normalizeResult()', () => {
    it('should normalize snake_case fields', () => {
      const input = {
        score: 0.5,
        file_path: 'test.md',
        heading_path: 'Section > Title',
        matched_by: 'hybrid',
      };
      
      const result = normalizeResult(input);
      
      assert.strictEqual(result.score, 0.5);
      assert.strictEqual(result.file_path, 'test.md');
      assert.strictEqual(result.heading_path, 'Section > Title');
      assert.strictEqual(result.matched_by, 'hybrid');
    });

    it('should handle camelCase fields (for compatibility)', () => {
      const input = {
        score: 0.5,
        filePath: 'test.md',
        headingPath: 'Section > Title',
        matchedBy: 'vector',
      };
      
      const result = normalizeResult(input);
      
      assert.strictEqual(result.file_path, 'test.md');
      assert.strictEqual(result.heading_path, 'Section > Title');
      assert.strictEqual(result.matched_by, 'vector');
    });

    it('should prefer snake_case over camelCase', () => {
      const input = {
        file_path: 'snake.md',
        filePath: 'camel.md',
      };
      
      const result = normalizeResult(input);
      
      assert.strictEqual(result.file_path, 'snake.md');
    });
  });

  describe('normalizeResults()', () => {
    it('should normalize array of results', () => {
      const input = [
        { score: 0.5, file_path: 'a.md' },
        { score: 0.3, filePath: 'b.md' },
      ];
      
      const results = normalizeResults(input);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].file_path, 'a.md');
      assert.strictEqual(results[1].file_path, 'b.md');
    });

    it('should handle empty array', () => {
      const results = normalizeResults([]);
      assert.deepStrictEqual(results, []);
    });

    it('should handle null/undefined', () => {
      assert.deepStrictEqual(normalizeResults(null), []);
      assert.deepStrictEqual(normalizeResults(undefined), []);
    });
  });

  describe('formatPlain()', () => {
    it('should format empty results', () => {
      const output = formatPlain('test query', []);
      
      assert.ok(output.includes('test query'));
      assert.ok(output.includes('No results found'));
    });

    it('should format content results', () => {
      const results = [
        {
          score: 0.5,
          file_path: 'docs/readme.md',
          heading_path: 'Introduction',
          content: 'This is the introduction section.',
          matched_by: 'vector+keyword',  // Use actual value from search results
          line_start: 10,
          line_end: 20,
        }
      ];
      
      const output = formatPlain('intro', results, { mode: 'hybrid', aggregateBy: 'content' });
      
      assert.ok(output.includes('Hybrid Search'));
      assert.ok(output.includes('docs/readme.md'));
      assert.ok(output.includes('Introduction'));
      assert.ok(output.includes('0.5000'));
      assert.ok(output.includes('[vector+keyword]'));
    });

    it('should format doc-level results', () => {
      const results = [
        {
          score: 0.8,
          file_path: 'project/spec.md',
          hit_count: 5,
          matched_by: 'vector',
        }
      ];
      
      const output = formatPlain('spec', results, { aggregateBy: 'doc' });
      
      assert.ok(output.includes('project/spec.md'));
      assert.ok(output.includes('5 matches'));
      assert.ok(output.includes('[vector]'));
    });

    it('should format folder-level results', () => {
      const results = [
        {
          score: 0.6,
          folder_path: 'docs/',
          doc_count: 10,
          hit_count: 25,
          matched_by: 'keyword',
        }
      ];
      
      const output = formatPlain('docs', results, { aggregateBy: 'folder' });
      
      assert.ok(output.includes('docs/'));
      assert.ok(output.includes('10 documents'));
      assert.ok(output.includes('25 matches'));
      assert.ok(output.includes('[keyword]'));
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(500);
      const results = [
        { score: 0.5, file_path: 'test.md', content: longContent, matched_by: 'hybrid' }
      ];
      
      const output = formatPlain('test', results, { aggregateBy: 'content' });
      
      assert.ok(output.includes('...'), 'Should indicate truncation');
      assert.ok(output.length < longContent.length + 200, 'Should be truncated');
    });
  });

  describe('formatJson()', () => {
    it('should return proper JSON structure', () => {
      const results = [
        { score: 0.5, file_path: 'test.md', matched_by: 'hybrid' }
      ];
      
      const output = formatJson('test query', results, { mode: 'hybrid', aggregateBy: 'doc' });
      
      assert.strictEqual(output.query, 'test query');
      assert.strictEqual(output.mode, 'hybrid');
      assert.strictEqual(output.aggregate_by, 'doc');
      assert.strictEqual(output.count, 1);
      assert.ok(Array.isArray(output.results));
    });

    it('should normalize result fields', () => {
      const results = [
        { score: 0.5, filePath: 'test.md', matchedBy: 'vector' }
      ];
      
      const output = formatJson('q', results);
      
      assert.strictEqual(output.results[0].file_path, 'test.md');
      assert.strictEqual(output.results[0].matched_by, 'vector');
    });
  });
});

