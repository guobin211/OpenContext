const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
  listFolders,
  createFolder,
  renameFolder,
  moveFolder,
  removeFolder,
  listDocs,
  createDoc,
  getDocMeta,
  getDocByStableId,
  moveDoc,
  renameDoc,
  removeDoc,
  setDocDescription,
  getDocContent,
  saveDocContent
} = require('../core/store/index.js');
const { Searcher, Indexer } = require('../core/search/index.js');
const { indexSync } = require('../core/search/indexSync');
const config = require('../core/config');

async function createUiServer({ host = '127.0.0.1', port = 3222 }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));
  app.use((req, _res, next) => {
    console.log(`[oc ui] ${req.method} ${req.path}`);
    next();
  });

  // Start index sync service (Rust native, interval-based)
  try {
    const started = await indexSync.start({ intervalSecs: 300 }); // 5 minutes
    if (started) {
      console.log('[oc ui] Index sync service started (5 min interval)');
    } else {
      console.log('[oc ui] Index sync service already running');
    }
  } catch (err) {
    console.warn('[oc ui] Failed to start index sync:', err.message);
  }

  // Folders
  app.get('/api/folders', (req, res) => {
    try {
      const folders = listFolders({ all: req.query.all === 'true' });
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/folders', (req, res) => {
    try {
      const { path: folderPath, description } = req.body;
      const result = createFolder({ path: folderPath, description });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/folders/rename', (req, res) => {
    try {
      const { path: folderPath, new_name } = req.body;
      const result = renameFolder({ path: folderPath, newName: new_name });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/folders/move', (req, res) => {
    try {
      const { path: folderPath, dest_folder_path } = req.body || {};
      const result = moveFolder({ path: folderPath, destFolderPath: dest_folder_path });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/folders/delete', (req, res) => {
    try {
      const { path: folderPath, force } = req.body;
      const result = removeFolder({ path: folderPath, force });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Docs
  app.get('/api/docs', (req, res) => {
    try {
      const folderPath = req.query.folder || '';
      const docs = listDocs({ folderPath, recursive: req.query.recursive === 'true' });
      res.json(docs);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Note: /api/docs/search removed - use /api/semantic-search instead

  app.get('/api/docs/by-id/:stableId', (req, res) => {
    try {
      const { stableId } = req.params || {};
      const doc = getDocByStableId(stableId);
      res.json({
        stable_id: doc.stable_id,
        rel_path: doc.rel_path,
        abs_path: doc.abs_path,
        description: doc.description || '',
        updated_at: doc.updated_at
      });
    } catch (error) {
      const msg = String(error?.message || 'Unknown error');
      if (msg.includes('not found')) return res.status(404).json({ error: msg });
      res.status(400).json({ error: msg });
    }
  });

  // Get doc meta by rel_path (useful when stable_id is missing on list endpoints in some runtimes)
  app.get('/api/docs/meta', (req, res) => {
    try {
      const docPath = req.query.path;
      if (!docPath) {
        return res.status(400).json({ error: 'Missing "path" query parameter' });
      }
      const doc = getDocMeta({ docPath });
      res.json({
        stable_id: doc.stable_id,
        rel_path: doc.rel_path,
        abs_path: doc.abs_path,
        description: doc.description || '',
        updated_at: doc.updated_at
      });
    } catch (error) {
      const msg = String(error?.message || 'Unknown error');
      if (msg.includes('not found')) return res.status(404).json({ error: msg });
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/docs', (req, res) => {
    try {
      const { folder_path, name, description } = req.body;
      const result = createDoc({ folderPath: folder_path, name, description });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/docs/move', (req, res) => {
    try {
      const { doc_path, dest_folder_path } = req.body;
      const result = moveDoc({ docPath: doc_path, destFolderPath: dest_folder_path });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/docs/rename', (req, res) => {
    try {
      const { doc_path, new_name } = req.body;
      const result = renameDoc({ docPath: doc_path, newName: new_name });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/docs/description', (req, res) => {
    try {
      const { doc_path, description } = req.body;
      const result = setDocDescription({ docPath: doc_path, description });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/docs/content', (req, res) => {
    try {
      const docPath = req.query.path;
      if (!docPath) {
        return res.status(400).json({ error: 'Missing "path" query parameter' });
      }
      const content = getDocContent(docPath);
      res.json({ content });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/docs/save', (req, res) => {
    try {
      const { path: docPath, content, description } = req.body || {};
      if (!docPath || typeof content !== 'string') {
        return res.status(400).json({ error: 'Missing path or content' });
      }
      const result = saveDocContent({ docPath, content, description });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/docs/delete', (req, res) => {
    try {
      const { path: docPath } = req.body || {};
      if (!docPath) {
        return res.status(400).json({ error: 'Missing path' });
      }
      const result = removeDoc({ docPath });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/debug-log', (req, res) => {
    console.dir(req.body, { depth: null });
    res.json({ ok: true });
  });

  // Environment & Config API
  app.get('/api/env', (req, res) => {
    try {
      const apiKey = config.get('EMBEDDING_API_KEY');
      const apiBase = config.get('EMBEDDING_API_BASE') || 'https://api.openai.com/v1';
      const model = config.get('EMBEDDING_MODEL') || 'text-embedding-3-small';
      
      // Mask API key
      let apiKeyMasked = null;
      if (apiKey && apiKey.length > 4) {
        apiKeyMasked = `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
      }
      
      res.json({
        embedding_model: model,
        embedding_api_base: apiBase,
        api_key_masked: apiKeyMasked,
        has_api_key: !!apiKey && apiKey.length > 0,
        config_path: config.getConfigPath(),
        dimensions: 1536
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/config', (req, res) => {
    try {
      const { apiKey, apiBase, model } = req.body || {};
      
      if (apiKey && apiKey.length > 0) {
        config.set('EMBEDDING_API_KEY', apiKey);
      }
      if (apiBase !== undefined) {
        config.set('EMBEDDING_API_BASE', apiBase);
      }
      if (model !== undefined) {
        config.set('EMBEDDING_MODEL', model);
      }
      
      res.json({ 
        success: true, 
        config_path: config.getConfigPath() 
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Index Management API
  let indexerInstance = null;
  
  async function getIndexer() {
    if (!indexerInstance) {
      indexerInstance = new Indexer();
      await indexerInstance.initialize();
    }
    return indexerInstance;
  }
  
  app.get('/api/index/status', async (req, res) => {
    try {
      const indexer = await getIndexer();
      const exists = await indexer.indexExists();
      let chunkCount = 0;
      let lastUpdated = null;
      
      if (exists) {
        const stats = await indexer.getStats();
        chunkCount = stats.totalChunks || 0;
        lastUpdated = stats.lastUpdated || null;
      }
      
      res.json({
        exists,
        chunkCount,
        lastUpdated
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/index/build', async (req, res) => {
    try {
      const indexer = await getIndexer();
      const result = await indexer.buildIndex({ force: req.body?.force });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/index/clean', async (req, res) => {
    try {
      const indexer = await getIndexer();
      await indexer.clean();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Semantic Search API
  let searcher = null;
  let searcherInitPromise = null;

  async function getSearcher(forceReinit = false) {
    if (forceReinit) {
      searcher = null;
      searcherInitPromise = null;
    }
    
    if (searcher?.initialized && !forceReinit) return searcher;
    if (searcherInitPromise && !forceReinit) return searcherInitPromise;
    
    searcherInitPromise = (async () => {
      try {
        searcher = new Searcher();
        await searcher.initialize(forceReinit);
        return searcher;
      } catch (err) {
        console.warn('[oc ui] Semantic search init failed:', err.message);
        searcher = null;
        searcherInitPromise = null;
        throw err;
      }
    })();
    
    return searcherInitPromise;
  }

  app.get('/api/semantic-search', async (req, res) => {
    try {
      const query = req.query.q || '';
      const limit = Number(req.query.limit) || 10;
      const mode = req.query.mode || 'hybrid'; // hybrid | vector | keyword
      const aggregateBy = req.query.aggregateBy || 'doc'; // content | doc | folder

      if (!query.trim()) {
        return res.json({ results: [], query, mode, aggregate_by: aggregateBy });
      }

      let searchEngine;
      try {
        searchEngine = await getSearcher();
      } catch (initErr) {
        // If init fails, return with indexMissing hint
        return res.json({ 
          results: [], 
          query,
          error: 'Search index not built. Run "oc index build" first.',
          indexMissing: true
        });
      }

      let results;
      try {
        results = await searchEngine.search(query, { limit, mode, aggregateBy });
      } catch (searchErr) {
        // If search fails (e.g., stale connection), try reinitializing once
        if (searchErr.message && searchErr.message.includes('lance error')) {
          console.log('[oc ui] Search error, trying to reinitialize...');
          try {
            searchEngine = await getSearcher(true); // Force reinit
            results = await searchEngine.search(query, { limit, mode, aggregateBy });
          } catch (retryErr) {
            throw retryErr;
          }
        } else {
          throw searchErr;
        }
      }
      
      res.json({
        query,
        mode,
        aggregate_by: aggregateBy,
        count: results.length,
        results: results.map(r => ({
          score: r.score,
          file_path: r.filePath,
          heading_path: r.headingPath || '',
          section_title: r.sectionTitle || '',
          line_start: r.lineStart,
          line_end: r.lineEnd,
          content: r.content,
          matched_by: r.matchedBy || r.source,
          hit_count: r.hitCount,
          doc_count: r.docCount,
          display_name: r.displayName,
          folder_path: r.folderPath
        }))
      });
    } catch (error) {
      const msg = error.message || 'Search failed';
      // If index not found, return empty results with hint
      if (msg.includes('index not found') || msg.includes('not found')) {
        return res.json({ 
          results: [], 
          query: req.query.q || '',
          error: 'Search index not built. Run "oc index build" first.',
          indexMissing: true
        });
      }
      res.status(500).json({ error: msg });
    }
  });

  const distPath = path.resolve(__dirname, '../../dist/ui');
  if (!fs.existsSync(distPath)) {
    console.warn('[oc ui] UI assets not found. Have you run "npm run ui:build"?');
  }
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = {
  createUiServer
};
