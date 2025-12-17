/**
 * OpenContext Search Module
 * 
 * Provides semantic search capabilities via Rust native bindings.
 */

const native = require('../native');
const { NativeSearcher, NativeIndexer } = require('./native-adapter');

// Require native bindings at load time
native.require();

// Log if debug enabled
if (process.env.OC_SEARCH_DEBUG) {
  console.log('[oc search] Using native (Rust) implementation');
}

// Export native implementations as primary classes
const Searcher = NativeSearcher;
const Indexer = NativeIndexer;

module.exports = {
  // Main exports
  Searcher,
  Indexer,
  
  // Implementation info
  isNativeAvailable: native.isAvailable,
  USE_NATIVE: true,
  
  // Explicit access to native implementations
  NativeSearcher,
  NativeIndexer,
};
