/**
 * Store Bindings Tests
 * 
 * Tests for the native OpenContext store operations.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load native bindings
let native;
try {
  native = require('./index.js');
} catch (e) {
  console.error('Failed to load native bindings:', e.message);
  console.log('Run "npm run build" first to compile the native module.');
  process.exit(1);
}

// Test environment setup
let tempDir;
let originalEnv;

function setupTestEnv() {
  tempDir = path.join(os.tmpdir(), `oc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  originalEnv = {
    OPENCONTEXT_ROOT: process.env.OPENCONTEXT_ROOT,
    OPENCONTEXT_CONTEXTS_ROOT: process.env.OPENCONTEXT_CONTEXTS_ROOT,
    OPENCONTEXT_DB_PATH: process.env.OPENCONTEXT_DB_PATH,
  };
  
  process.env.OPENCONTEXT_ROOT = tempDir;
  process.env.OPENCONTEXT_CONTEXTS_ROOT = path.join(tempDir, 'contexts');
  process.env.OPENCONTEXT_DB_PATH = path.join(tempDir, 'test.db');
}

function cleanupTestEnv() {
  // Restore original env
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  
  // Clean up temp dir
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('Native Store Bindings', async () => {
  
  before(() => {
    setupTestEnv();
  });
  
  after(() => {
    cleanupTestEnv();
  });
  
  describe('initEnvironment()', () => {
    it('should return environment info', () => {
      const info = native.initEnvironment();
      
      assert.ok(info.contexts_root, 'Should have contexts_root');
      assert.ok(info.db_path, 'Should have db_path');
      assert.ok(info.contexts_root.includes('contexts'), 'contexts_root should contain "contexts"');
    });
  });

  describe('Folder Operations', () => {
    
    describe('createFolder()', () => {
      it('should create a folder', () => {
        const result = native.createFolder({ path: 'test-folder-1' });
        
        assert.strictEqual(result.rel_path, 'test-folder-1');
        assert.ok(result.abs_path, 'Should have abs_path');
      });

      it('should create folder with description', () => {
        const result = native.createFolder({ 
          path: 'test-folder-2', 
          description: 'A test folder' 
        });
        
        assert.strictEqual(result.description, 'A test folder');
      });

      it('should create nested folder', () => {
        const result = native.createFolder({ path: 'parent/child/grandchild' });
        
        assert.strictEqual(result.rel_path, 'parent/child/grandchild');
      });
    });

    describe('listFolders()', () => {
      it('should list top-level folders', () => {
        const folders = native.listFolders({ all: false });
        
        assert.ok(Array.isArray(folders));
        assert.ok(folders.length > 0);
      });

      it('should list all folders when all=true', () => {
        const allFolders = native.listFolders({ all: true });
        const topFolders = native.listFolders({ all: false });
        
        assert.ok(allFolders.length >= topFolders.length);
      });

      it('should return folders with correct shape', () => {
        const folders = native.listFolders({ all: true });
        const folder = folders[0];
        
        assert.ok(folder.id !== undefined, 'Should have id');
        assert.ok(folder.name, 'Should have name');
        assert.ok(folder.rel_path !== undefined, 'Should have rel_path');
        assert.ok(folder.abs_path, 'Should have abs_path');
        assert.ok(folder.created_at, 'Should have created_at');
        assert.ok(folder.updated_at, 'Should have updated_at');
      });
    });

    describe('renameFolder()', () => {
      it('should rename a folder', () => {
        native.createFolder({ path: 'to-rename' });
        
        const result = native.renameFolder({ 
          path: 'to-rename', 
          newName: 'renamed' 
        });
        
        assert.strictEqual(result.old_path, 'to-rename');
        assert.strictEqual(result.new_path, 'renamed');
      });

      it('should return error on folder not found', () => {
        const result = native.renameFolder({ path: 'nonexistent-rename', newName: 'new' });
        assert.ok(result instanceof Error, 'Should return Error');
        assert.ok(result.message.includes('not found') || result.message.includes('does not exist'));
      });
    });

    describe('removeFolder()', () => {
      it('should remove an empty folder', () => {
        native.createFolder({ path: 'to-delete' });
        
        const result = native.removeFolder({ path: 'to-delete' });
        
        assert.strictEqual(result.rel_path, 'to-delete');
      });

      it('should return error on non-empty folder without force', () => {
        native.createFolder({ path: 'non-empty-test' });
        native.createDoc({ folderPath: 'non-empty-test', name: 'doc.md' });
        
        const result = native.removeFolder({ path: 'non-empty-test', force: false });
        assert.ok(result instanceof Error, 'Should return Error');
        assert.ok(result.message.includes('not empty') || result.message.includes('--force'));
      });

      it('should remove non-empty folder with force=true', () => {
        native.createFolder({ path: 'force-delete' });
        native.createDoc({ folderPath: 'force-delete', name: 'doc.md' });
        
        const result = native.removeFolder({ path: 'force-delete', force: true });
        
        assert.strictEqual(result.rel_path, 'force-delete');
      });
    });
  });

  describe('Document Operations', () => {
    
    before(() => {
      // Create test folder for doc tests
      try {
        native.createFolder({ path: 'docs-test' });
      } catch (e) {
        // May already exist
      }
    });

    describe('createDoc()', () => {
      it('should create a document', () => {
        const result = native.createDoc({ 
          folderPath: 'docs-test', 
          name: 'test-doc.md' 
        });
        
        assert.strictEqual(result.rel_path, 'docs-test/test-doc.md');
        assert.ok(result.stable_id, 'Should have stable_id');
        assert.strictEqual(result.stable_id.length, 36, 'stable_id should be UUID format');
      });

      it('should create doc with description', () => {
        const result = native.createDoc({ 
          folderPath: 'docs-test', 
          name: 'with-desc.md',
          description: 'A document description'
        });
        
        assert.strictEqual(result.description, 'A document description');
      });

      it('should return error on duplicate doc', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'duplicate-test.md' });
        
        const result = native.createDoc({ folderPath: 'docs-test', name: 'duplicate-test.md' });
        assert.ok(result instanceof Error, 'Should return Error');
        assert.ok(result.message.includes('already exists'));
      });

      it('should return error on invalid name', () => {
        const result = native.createDoc({ folderPath: 'docs-test', name: 'invalid/name.md' });
        assert.ok(result instanceof Error, 'Should return Error');
        assert.ok(result.message.includes('/'));
      });
    });

    describe('listDocs()', () => {
      it('should list documents in folder', () => {
        const docs = native.listDocs({ folderPath: 'docs-test' });
        
        assert.ok(Array.isArray(docs));
        assert.ok(docs.length > 0);
      });

      it('should return docs with correct shape', () => {
        const docs = native.listDocs({ folderPath: 'docs-test' });
        const doc = docs[0];
        
        assert.ok(doc.id !== undefined, 'Should have id');
        assert.ok(doc.name, 'Should have name');
        assert.ok(doc.rel_path, 'Should have rel_path');
        assert.ok(doc.abs_path, 'Should have abs_path');
        assert.ok(doc.stable_id, 'Should have stable_id');
        assert.ok(doc.created_at, 'Should have created_at');
        assert.ok(doc.updated_at, 'Should have updated_at');
      });
    });

    describe('moveDoc()', () => {
      it('should move a document', () => {
        native.createFolder({ path: 'move-dest' });
        native.createDoc({ folderPath: 'docs-test', name: 'to-move.md' });
        
        const result = native.moveDoc({ 
          docPath: 'docs-test/to-move.md', 
          destFolderPath: 'move-dest' 
        });
        
        assert.strictEqual(result.old_path, 'docs-test/to-move.md');
        assert.strictEqual(result.new_path, 'move-dest/to-move.md');
      });
    });

    describe('renameDoc()', () => {
      it('should rename a document', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'to-rename.md' });
        
        const result = native.renameDoc({ 
          docPath: 'docs-test/to-rename.md', 
          newName: 'renamed.md' 
        });
        
        assert.strictEqual(result.old_path, 'docs-test/to-rename.md');
        assert.strictEqual(result.new_path, 'docs-test/renamed.md');
      });
    });

    describe('removeDoc()', () => {
      it('should remove a document', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'to-delete.md' });
        
        const result = native.removeDoc({ docPath: 'docs-test/to-delete.md' });
        
        assert.strictEqual(result.rel_path, 'docs-test/to-delete.md');
      });
    });

    describe('setDocDescription()', () => {
      it('should update document description', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'for-desc.md' });
        
        const result = native.setDocDescription({ 
          docPath: 'docs-test/for-desc.md', 
          description: 'Updated description' 
        });
        
        assert.strictEqual(result.description, 'Updated description');
      });
    });

    describe('getDocMeta()', () => {
      it('should get document metadata', () => {
        native.createDoc({ 
          folderPath: 'docs-test', 
          name: 'meta-test.md',
          description: 'Test doc'
        });
        
        const doc = native.getDocMeta('docs-test/meta-test.md');
        
        assert.strictEqual(doc.name, 'meta-test.md');
        assert.strictEqual(doc.description, 'Test doc');
        assert.ok(doc.stable_id);
      });
    });

    describe('getDocByStableId()', () => {
      it('should get document by stable_id', () => {
        const created = native.createDoc({ 
          folderPath: 'docs-test', 
          name: 'stable-id-test.md' 
        });
        
        const doc = native.getDocByStableId(created.stable_id);
        
        assert.strictEqual(doc.rel_path, 'docs-test/stable-id-test.md');
        assert.strictEqual(doc.stable_id, created.stable_id);
      });

      it('should return error on not found', () => {
        const result = native.getDocByStableId('00000000-0000-0000-0000-000000000000');
        assert.ok(result instanceof Error, 'Should return Error');
        assert.ok(result.message.includes('not found'));
      });
    });

    describe('getDocContent() / saveDocContent()', () => {
      it('should get empty content initially', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'content-test.md' });
        
        const content = native.getDocContent('docs-test/content-test.md');
        
        assert.strictEqual(content, '');
      });

      it('should save and get content', () => {
        native.createDoc({ folderPath: 'docs-test', name: 'save-content.md' });
        
        native.saveDocContent({ 
          docPath: 'docs-test/save-content.md', 
          content: '# Hello World' 
        });
        
        const content = native.getDocContent('docs-test/save-content.md');
        
        assert.strictEqual(content, '# Hello World');
      });
    });
  });

  describe('Manifest', () => {
    
    before(() => {
      try {
        native.createFolder({ path: 'manifest-test' });
        native.createDoc({ 
          folderPath: 'manifest-test', 
          name: 'doc1.md',
          description: 'First doc'
        });
        native.createDoc({ 
          folderPath: 'manifest-test', 
          name: 'doc2.md',
          description: 'Second doc'
        });
      } catch (e) {
        // May already exist from previous test run
      }
    });

    describe('generateManifest()', () => {
      it('should generate manifest for folder', () => {
        const manifest = native.generateManifest({ folderPath: 'manifest-test' });
        
        assert.ok(Array.isArray(manifest));
        assert.ok(manifest.length >= 2);
      });

      it('should respect limit option', () => {
        const manifest = native.generateManifest({ 
          folderPath: 'manifest-test', 
          limit: 1 
        });
        
        assert.strictEqual(manifest.length, 1);
      });

      it('should return entries with correct shape', () => {
        const manifest = native.generateManifest({ folderPath: 'manifest-test' });
        const entry = manifest[0];
        
        assert.ok(entry.doc_name, 'Should have doc_name');
        assert.ok(entry.rel_path, 'Should have rel_path');
        assert.ok(entry.abs_path, 'Should have abs_path');
        assert.ok(entry.stable_id, 'Should have stable_id');
        assert.ok(entry.updated_at, 'Should have updated_at');
      });
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  console.log('Running store binding tests...');
}

