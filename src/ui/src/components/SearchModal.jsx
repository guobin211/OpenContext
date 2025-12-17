import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  FolderIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { semanticSearch } from '../api';

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Highlight matched text
function HighlightText({ text, query, maxLength = 200 }) {
  if (!text || !query) {
    const truncated = text?.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    return <span className="text-gray-500">{truncated}</span>;
  }

  const truncated = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  const parts = truncated.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return (
    <span className="text-gray-500">
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="text-gray-900 font-medium border-b border-gray-300/60 bg-yellow-100/50 px-0.5 rounded-[1px]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// Search result item
function SearchResultItem({ result, query, isSelected, onClick }) {
  const { t } = useTranslation();
  const isFolder = result.folder_path !== undefined && result.aggregate_type === 'folder';
  const displayPath = result.file_path || result.folder_path || '';
  const displayName = result.display_name || displayPath.split('/').pop()?.replace('.md', '') || t('search.untitled');

  // Format heading path for display - Notion style breadcrumbs
  const headingDisplay = result.heading_path ? (
    <span className="flex items-center gap-1 text-gray-400">
      <span className="opacity-40">/</span>
      <span>{result.heading_path}</span>
    </span>
  ) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-75 group
        ${isSelected 
          ? 'bg-[rgba(55,53,47,0.08)]' 
          : 'hover:bg-[rgba(55,53,47,0.03)]'
        }
      `}
    >
      <div className={`
        mt-0.5 p-1 flex-shrink-0 text-gray-400
        ${isSelected ? 'text-gray-600' : ''}
      `}>
        {isFolder ? (
          <FolderIcon className="h-5 w-5" strokeWidth={1.5} />
        ) : (
          <DocumentTextIcon className="h-5 w-5" strokeWidth={1.5} />
        )}
      </div>
      
      <div className="flex-1 min-w-0 overflow-hidden py-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[14px] truncate ${isSelected ? 'text-gray-900 font-medium' : 'text-[#37352f] font-medium'}`}>
            {displayName}
          </span>
          {/* Hidden score for debug, or could be shown very subtly */}
          {/* <span className="text-[10px] text-gray-300 ml-auto font-mono">{(result.score * 100).toFixed(0)}%</span> */}
        </div>
        
        {/* Breadcrumbs / Path */}
        <div className="flex items-center gap-1 text-[12px] text-gray-400 truncate font-normal mb-1.5 leading-none">
          <span className="truncate">{displayPath}</span>
          {headingDisplay}
        </div>
        
        {result.content && (
          <div className="text-[12px] leading-relaxed line-clamp-2 mt-1 font-normal">
            <HighlightText text={result.content} query={query} maxLength={120} />
          </div>
        )}

        {/* Technical metadata - only show for content-level results, not aggregated docs */}
        {result.matched_by && !result.aggregate_type && (
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gray-400">
             {result.matched_by === 'vector' && (
               <>
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                 <span>语义匹配</span>
               </>
             )}
             {result.matched_by === 'keyword' && (
               <>
                 <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                 <span>关键词匹配</span>
               </>
             )}
             {result.matched_by === 'vector+keyword' && (
               <>
                 <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                 <span>语义+关键词</span>
               </>
             )}
          </div>
        )}
      </div>

      {/* Enter key hint that appears on selection - Notion style */}
      {isSelected && (
        <div className="flex-shrink-0 self-center hidden sm:block">
          <span className="text-[10px] font-medium text-gray-400 px-1.5 py-0.5 border border-gray-200 rounded">↵</span>
        </div>
      )}
    </button>
  );
}

export function SearchModal({ isOpen, onClose, onSelectDoc }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState(null);
  const [indexMissing, setIndexMissing] = useState(false);
  
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  
  const debouncedQuery = useDebounce(query, 300);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setError(null);
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setError(null);
      setIndexMissing(false);
      return;
    }

    const doSearch = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await semanticSearch(debouncedQuery, {
          limit: 12,
          mode: 'hybrid',
          aggregateBy: 'doc'
        });
        
        setResults(response.results || []);
        setIndexMissing(response.indexMissing || false);
        if (response.error && !response.indexMissing) {
          setError(response.error);
        }
        setSelectedIndex(0);
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    doSearch();
  }, [debouncedQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedEl = resultsRef.current.children[selectedIndex];
      selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, results.length]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected?.file_path) {
        onSelectDoc({ rel_path: selected.file_path });
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIndex, onSelectDoc, onClose]);

  // Handle clicking outside
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle selecting a result
  const handleSelectResult = useCallback((result) => {
    if (result?.file_path) {
      onSelectDoc({ rel_path: result.file_path });
      onClose();
    }
  }, [onSelectDoc, onClose]);

  // Platform detection for keyboard shortcut display
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  }, []);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity" />
      
      {/* Modal - Notion style rounded corners, shadow, and background */}
      <div 
        className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.25)' }}
      >
        {/* Search Input Area */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
          <MagnifyingGlassIcon className={`h-5 w-5 flex-shrink-0 transition-colors ${isLoading ? 'text-gray-600 animate-pulse' : 'text-gray-400'}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 text-lg text-[#37352f] placeholder-gray-400 bg-transparent border-none focus:ring-0 p-0 outline-none leading-tight"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
          <div className="flex items-center">
            <span className="hidden sm:inline-block text-[11px] text-gray-400 font-medium px-1.5 border border-gray-200 rounded">
              ESC
            </span>
          </div>
        </div>

        {/* Results */}
        <div 
          ref={resultsRef}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent bg-white"
        >
          {/* Loading state */}
          {isLoading && query && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-5 w-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          )}

          {/* Index missing warning */}
          {indexMissing && !isLoading && (
            <div className="px-5 py-8 text-center">
              <p className="text-gray-600 text-sm mb-2">{t('search.indexMissing')}</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 font-mono">
                oc index build
              </code>
            </div>
          )}

          {/* Error state */}
          {error && !indexMissing && !isLoading && (
            <div className="px-5 py-8 text-center text-red-500 text-sm">
              <p>{error}</p>
            </div>
          )}

          {/* Results list */}
          {!isLoading && !error && !indexMissing && results.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-500/80 uppercase tracking-wider mb-1">
                {t('search.results')}
              </div>
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.file_path}-${index}`}
                  result={result}
                  query={query}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelectResult(result)}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && !indexMissing && query && results.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-gray-500 text-sm">{t('search.noResults')}</p>
            </div>
          )}

          {/* Initial state - tips */}
          {!query && !isLoading && (
            <div className="px-8 py-12">
              <div className="text-center">
                <p className="text-gray-400 text-sm">{t('search.tip')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 select-none">
          <span className="flex items-center gap-2">
            <span className="flex gap-0.5">
              <kbd className="font-sans px-1 bg-white border border-gray-200 rounded text-gray-500">↑</kbd>
              <kbd className="font-sans px-1 bg-white border border-gray-200 rounded text-gray-500">↓</kbd>
            </span>
            <span>{t('search.navigate')}</span>
            <kbd className="font-sans px-1 bg-white border border-gray-200 rounded text-gray-500 ml-2">↵</kbd>
            <span>{t('search.open')}</span>
          </span>
          <span className="flex items-center gap-1 opacity-60">
            <span>{t('app.name')} Search</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Hook for global keyboard shortcut
export function useSearchShortcut(callback) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // ⌘K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callback]);
}
