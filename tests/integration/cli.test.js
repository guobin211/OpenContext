/**
 * CLI Integration Tests
 * 
 * Tests for the CLI commands end-to-end.
 */

const { describe, it, before, after, assert, createTempDir, cleanupTempDir, mockEnv } = require('../helpers');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_PATH = path.join(__dirname, '../../bin/oc.js');

/**
 * Run CLI command and return output
 */
function runCli(args, options = {}) {
  const { env = {}, timeout = 30000 } = options;
  
  try {
    const output = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      timeout,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: output, exitCode: 0 };
  } catch (e) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status || 1,
      error: e.message,
    };
  }
}

describe('CLI Integration', async () => {
  let tempDir;
  let restoreEnv;

  before(() => {
    tempDir = createTempDir();
    restoreEnv = mockEnv({
      OPENCONTEXT_ROOT: tempDir,
      OPENCONTEXT_CONTEXTS_ROOT: path.join(tempDir, 'contexts'),
      OPENCONTEXT_DB_PATH: path.join(tempDir, 'test.db'),
    });
    
    // Create contexts directory
    fs.mkdirSync(path.join(tempDir, 'contexts'), { recursive: true });
  });

  after(() => {
    restoreEnv();
    cleanupTempDir(tempDir);
  });

  describe('oc --help', () => {
    it('should show help text', () => {
      const { stdout, exitCode } = runCli('--help');
      
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('OpenContext'), 'Should mention OpenContext');
      assert.ok(stdout.includes('Commands:') || stdout.includes('Usage:'), 'Should show commands');
    });
  });

  // Note: CLI doesn't support --version flag directly

  describe('oc folder', () => {
    it('should list folders (initially empty)', () => {
      const { stdout, exitCode } = runCli('folder ls');
      
      assert.strictEqual(exitCode, 0);
      // May show empty or header text
    });

    it('should create a folder', () => {
      const { stdout, exitCode } = runCli('folder create TestFolder');
      
      assert.strictEqual(exitCode, 0);
    });

    it('should list the created folder', () => {
      const { stdout, exitCode } = runCli('folder ls');
      
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('TestFolder'), 'Should show created folder');
    });
  });

  describe('oc doc', () => {
    before(() => {
      // Ensure folder exists
      runCli('folder create DocsTest');
    });

    it('should create a document', () => {
      const { stdout, exitCode } = runCli('doc create DocsTest test-doc');
      
      assert.strictEqual(exitCode, 0);
    });

    it('should list documents in folder', () => {
      const { stdout, exitCode } = runCli('doc ls DocsTest');
      
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('test-doc'), 'Should show created document');
    });
  });

  describe('oc search', { skip: true }, async () => {
    // Note: Search tests require index to be built, which needs API key
    // Skip by default, enable when API key is available
    
    it('should search with query', () => {
      const { stdout, exitCode, stderr } = runCli('search "test query" --limit 3');
      
      // May fail if index not built, but should not crash
      assert.ok(exitCode === 0 || stderr.includes('index'), 'Should handle gracefully');
    });

    it('should support --format json', () => {
      const { stdout, exitCode } = runCli('search "test" --format json --limit 1');
      
      if (exitCode === 0) {
        // Should be valid JSON
        assert.doesNotThrow(() => JSON.parse(stdout), 'Output should be valid JSON');
      }
    });
  });

  describe('oc index', async () => {
    it('should show index status', () => {
      const { stdout, stderr, exitCode } = runCli('index status');
      
      // May show: "not found", stats, or API key error - all are valid responses
      // exitCode 0 = success (found or not found)
      // exitCode 1 with API key error = expected in test env without config
      const output = stdout + stderr;
      const isValidResponse = exitCode === 0 || 
                             output.includes('not found') ||
                             output.includes('API key');
      assert.ok(isValidResponse, 'Should report status or config error');
    });
  });

  describe('oc config', () => {
    it('should list config keys', () => {
      const { stdout, exitCode } = runCli('config list');
      
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('EMBEDDING') || stdout.includes('API'), 'Should show config keys');
    });

    it('should set and get config value', () => {
      // Set
      runCli('config set EMBEDDING_MODEL test-model-123');
      
      // Get
      const { stdout, exitCode } = runCli('config get EMBEDDING_MODEL');
      
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('test-model-123'), 'Should return set value');
    });
  });
});

