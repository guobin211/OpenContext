/**
 * Index Sync Service - Rust Native Implementation
 * 
 * Wraps the native Rust IndexSyncService which:
 * - Listens to document/folder events via SharedEventBus
 * - Batches index updates at regular intervals (default: 5 minutes)
 * - More efficient than real-time updates
 */

const native = require('../native');

/**
 * Start the index sync service
 * 
 * The service runs in the background and automatically updates the search
 * index when documents are created, updated, deleted, moved, or renamed.
 * 
 * @param {Object} options
 * @param {number} options.intervalSecs - Interval in seconds between batch processing (default: 300)
 * @returns {Promise<boolean>} true if started, false if already running
 */
async function start(options = {}) {
  const intervalSecs = options.intervalSecs ?? 300; // Default 5 minutes
  return await native.get().startIndexSync(intervalSecs);
}

/**
 * Check if the index sync service is running
 * @returns {boolean}
 */
function isRunning() {
  if (!native.isAvailable()) return false;
  return native.get().isIndexSyncRunning();
}

/**
 * Get index sync service status
 * @returns {{ running: boolean }}
 */
function getStatus() {
  if (!native.isAvailable()) {
    return { running: false, error: native.getError()?.message };
  }
  return native.get().getIndexSyncStatus();
}

// Singleton-like interface for backward compatibility
const indexSync = {
  start,
  isRunning,
  getStatus,
  
  // Compatibility methods (no-op in native version)
  stop: () => {
    console.log('[IndexSync] Note: Native service cannot be stopped once started');
  },
  setEnabled: (enabled) => {
    console.log('[IndexSync] Note: Use native service control instead');
  },
};

module.exports = { indexSync, start, isRunning, getStatus };
