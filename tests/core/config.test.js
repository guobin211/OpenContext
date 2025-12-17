/**
 * Config Module Tests
 */

const { describe, it, before, after, assert, mockEnv, createTempDir, cleanupTempDir } = require('../helpers');
const path = require('path');
const fs = require('fs');

describe('Config Module', async () => {
  let tempDir;
  let restoreEnv;
  let config;

  before(() => {
    // Create temp directory and redirect config path
    tempDir = createTempDir();
    restoreEnv = mockEnv({
      OPENCONTEXT_ROOT: tempDir,
      EMBEDDING_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      EMBEDDING_API_BASE: undefined,
    });
    
    // Clear require cache to pick up new env vars
    delete require.cache[require.resolve('../../src/core/config')];
    config = require('../../src/core/config');
  });

  after(() => {
    restoreEnv();
    cleanupTempDir(tempDir);
  });

  describe('get()', () => {
    it('should return default value when key is not set', () => {
      const value = config.get('EMBEDDING_API_BASE');
      assert.ok(value, 'Should have a default value');
    });

    it('should return undefined for unset sensitive keys', () => {
      const value = config.get('EMBEDDING_API_KEY');
      assert.strictEqual(value, undefined, 'Unset sensitive key should be undefined');
    });

    it('should prefer environment variable over config file', () => {
      const cleanup = mockEnv({ EMBEDDING_API_KEY: 'env-test-key' });
      try {
        // Re-require to pick up env change
        delete require.cache[require.resolve('../../src/core/config')];
        const freshConfig = require('../../src/core/config');
        const value = freshConfig.get('EMBEDDING_API_KEY');
        assert.strictEqual(value, 'env-test-key');
      } finally {
        cleanup();
      }
    });
  });

  describe('set()', () => {
    it('should save value to config file', () => {
      config.set('EMBEDDING_MODEL', 'test-model');
      
      // Read config file directly
      const configPath = path.join(tempDir, 'config.json');
      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      assert.strictEqual(content.EMBEDDING_MODEL, 'test-model');
    });

    it('should throw for unknown keys', () => {
      assert.throws(() => {
        config.set('UNKNOWN_KEY', 'value');
      }, /Unknown config key/);
    });
  });

  describe('list()', () => {
    it('should return array of key info', () => {
      const listResult = config.list();
      assert.ok(Array.isArray(listResult));
      assert.ok(listResult.length > 0);
      
      const keyInfo = listResult.find(k => k.key === 'EMBEDDING_API_KEY');
      assert.ok(keyInfo, 'Should include EMBEDDING_API_KEY');
      assert.ok(keyInfo.description, 'Should have description');
      assert.ok('source' in keyInfo, 'Should have source');
      assert.ok('isSet' in keyInfo, 'Should have isSet');
    });
  });

  describe('unset()', () => {
    it('should remove value from config file', () => {
      config.set('EMBEDDING_MODEL', 'to-delete');
      config.unset('EMBEDDING_MODEL');
      
      const configPath = path.join(tempDir, 'config.json');
      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      assert.ok(!('EMBEDDING_MODEL' in content), 'Key should be deleted');
    });
  });
});

