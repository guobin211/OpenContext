/**
 * Test Helpers
 * 
 * Shared utilities for all tests.
 * Uses Node.js built-in test framework (node:test).
 */

const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Create a temporary directory for test fixtures
 * @returns {string} Path to temp directory
 */
function createTempDir() {
  const tempDir = path.join(os.tmpdir(), `oc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 * @param {string} dir - Directory to remove
 */
function cleanupTempDir(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create test fixtures in a directory
 * @param {string} dir - Target directory
 * @param {Object} files - Map of relative paths to contents
 */
function createFixtures(dir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

/**
 * Assert that two objects have the same structure (keys)
 * @param {Object} actual - Actual object
 * @param {Object} expected - Expected object
 * @param {string} message - Error message
 */
function assertStructure(actual, expected, message = 'Structure mismatch') {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  assert.deepStrictEqual(actualKeys, expectedKeys, message);
}

/**
 * Assert that a value is within a range
 * @param {number} actual - Actual value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} message - Error message
 */
function assertInRange(actual, min, max, message = 'Value out of range') {
  assert.ok(actual >= min && actual <= max, `${message}: ${actual} not in [${min}, ${max}]`);
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Max wait time in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Mock environment variables for a test
 * @param {Object} vars - Variables to set
 * @returns {Function} Cleanup function
 */
function mockEnv(vars) {
  const original = {};
  for (const [key, value] of Object.entries(vars)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

module.exports = {
  // Node.js test framework re-exports
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  assert,
  
  // Custom helpers
  createTempDir,
  cleanupTempDir,
  createFixtures,
  assertStructure,
  assertInRange,
  waitFor,
  mockEnv,
};

