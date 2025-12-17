import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

const LAST_URL_KEY = 'opencontext_last_url';

function saveLastUrl() {
  try {
    const url = window.location.pathname + window.location.search;
    if (url && url !== '/') {
      localStorage.setItem(LAST_URL_KEY, url);
    }
  } catch {
    // ignore localStorage errors
  }
}

function restoreLastUrl() {
  try {
    // Only restore if current URL has no meaningful params
    const currentSearch = window.location.search || '';
    if (currentSearch && currentSearch !== '?') return false;
    
    const lastUrl = localStorage.getItem(LAST_URL_KEY);
    if (!lastUrl || lastUrl === '/') return false;
    
    // Restore the URL without triggering a page reload
    window.history.replaceState({}, '', lastUrl);
    return true;
  } catch {
    return false;
  }
}

export function useDocLoader({
  api,
  foldersLoaded,
  expandedFolders,
  setExpandedFolders,
  folderDocs,
  refreshFolder,
  hasPendingChanges,
  beforeLoadDoc,
  onAfterLoadDoc,
  setError,
  onAlert,
}) {
  const initial = useRef({
    selectedDoc: null,
    docContent: '',
    isLoadingContent: false,
    diffGate: null, // { local, remote, remoteUpdatedAt, rel_path, snippet }
    spaceNewDocs: null, // { space, count, latestRelPath }
  }).current;

  function reducer(state, action) {
    switch (action.type) {
      case 'LOAD_DOC_START':
        return { ...state, isLoadingContent: true };
      case 'LOAD_DOC_SUCCESS':
        return {
          ...state,
          selectedDoc: action.doc,
          docContent: action.content,
          isLoadingContent: false,
        };
      case 'LOAD_DOC_FINISH':
        return { ...state, isLoadingContent: false };
      case 'SET_SELECTED_DOC':
        return { ...state, selectedDoc: action.doc };
      case 'SET_DOC_CONTENT':
        return { ...state, docContent: action.content };
      case 'SET_DIFF_GATE':
        return { ...state, diffGate: action.diffGate };
      case 'CLEAR_DIFF_GATE':
        return { ...state, diffGate: null };
      case 'SET_SPACE_NEW_DOCS':
        return { ...state, spaceNewDocs: action.spaceNewDocs };
      default:
        return state;
    }
  }

  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setSelectedDoc = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.selectedDoc;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_SELECTED_DOC', doc: next });
  }, []);

  const setDocContent = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.docContent;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_DOC_CONTENT', content: next });
  }, []);

  const setDiffGate = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.diffGate;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_DIFF_GATE', diffGate: next });
  }, []);

  const setSpaceNewDocs = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.spaceNewDocs;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_SPACE_NEW_DOCS', spaceNewDocs: next });
  }, []);

  const editGateInFlightRef = useRef(false);
  const isHydratingContentRef = useRef(false);
  const lastSavedContentRef = useRef('');
  const lastSpaceSnapshotRef = useRef({ space: '', relPaths: new Set() });
  const editorScrollRef = useRef(null);

  const getStableId = useCallback((doc) => {
    return String(doc?.stable_id || doc?.stableId || '').trim();
  }, []);

  const updateUrlForDoc = useCallback(
    (doc, mode = 'replace') => {
      if (typeof window === 'undefined') return;
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        if (!doc) {
          params.delete('id');
          params.delete('doc');
        } else {
          const stableId = getStableId(doc);
          const relPath = String(doc?.rel_path || '').trim();
          if (stableId) params.set('id', stableId);
          else params.delete('id');
          if (relPath) params.set('doc', relPath);
          else params.delete('doc');
        }
        url.search = params.toString();
        if (mode === 'push') window.history.pushState({}, '', url);
        else window.history.replaceState({}, '', url);
      } catch {
        // ignore URL errors
      }
    },
    [getStableId],
  );

  const loadDocRaw = useCallback(
    async (doc, options = {}) => {
      if (!doc?.rel_path) return;
      const prevSelected = stateRef.current.selectedDoc;
      if (typeof beforeLoadDoc === 'function' && prevSelected?.rel_path && prevSelected.rel_path !== doc.rel_path) {
        const ok = await beforeLoadDoc(doc);
        if (!ok) return;
      }
      dispatch({ type: 'LOAD_DOC_START' });
      setError?.('');
      try {
        const urlMode = options?.urlMode;
        if (urlMode === 'push') updateUrlForDoc(doc, 'push');
        else if (urlMode === 'replace') updateUrlForDoc(doc, 'replace');
        else if (urlMode !== 'none') {
          if (prevSelected?.rel_path !== doc.rel_path) updateUrlForDoc(doc, 'push');
        }

        dispatch({ type: 'SET_SELECTED_DOC', doc });

        const parts = doc.rel_path.split('/');
        const newExpanded = new Set(expandedFolders);
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          newExpanded.add(currentPath);
        }
        setExpandedFolders(newExpanded);

        const shouldPreloadSidebar = options?.preloadSidebar !== false;
        if (shouldPreloadSidebar) {
          for (let i = 0; i < parts.length - 1; i++) {
            const folderPath = parts.slice(0, i + 1).join('/');
            if (!folderPath) continue;
            if (!folderDocs[folderPath]) {
              // eslint-disable-next-line no-await-in-loop
              await refreshFolder(folderPath).catch(() => {});
            }
          }
        }

        const { content } = await api.getDocContent(doc.rel_path);
        isHydratingContentRef.current = true;
        lastSavedContentRef.current = content;
        dispatch({ type: 'LOAD_DOC_SUCCESS', doc, content });
        onAfterLoadDoc?.({ doc, content });
        setTimeout(() => {
          isHydratingContentRef.current = false;
        }, 0);
      } catch (err) {
        setError?.(err.message);
      } finally {
        dispatch({ type: 'LOAD_DOC_FINISH' });
      }
    },
    [
      api,
      beforeLoadDoc,
      expandedFolders,
      folderDocs,
      onAfterLoadDoc,
      refreshFolder,
      setExpandedFolders,
      setError,
      updateUrlForDoc,
    ],
  );

  // Keep URL in sync when selected doc changes due to rename/move.
  useEffect(() => {
    if (!state.selectedDoc) return;
    updateUrlForDoc(state.selectedDoc, 'replace');
  }, [state.selectedDoc?.rel_path, state.selectedDoc?.stable_id, state.selectedDoc?.stableId, state.selectedDoc, updateUrlForDoc]);

  // Save current URL to localStorage for session restore
  useEffect(() => {
    saveLastUrl();
  }, [state.selectedDoc?.rel_path, state.selectedDoc?.stable_id]);

  const openDocByStableId = useCallback(
    async (stableId, meta = {}, options = {}) => {
      try {
        const fallbackRelPath = String(meta?.fallbackRelPath || '').trim();
        if (!stableId && fallbackRelPath) {
          await loadDocRaw(
            {
              rel_path: fallbackRelPath,
              description: '',
              updated_at: new Date().toISOString(),
            },
            options,
          );
          return;
        }
        const doc = await api.getDocById(stableId);
        await loadDocRaw(doc, options);
      } catch (err) {
        const fallbackRelPath = String(meta?.fallbackRelPath || '').trim();
        if (fallbackRelPath) {
          try {
            await loadDocRaw(
              {
                rel_path: fallbackRelPath,
                description: '',
                updated_at: new Date().toISOString(),
              },
              options,
            );
            return;
          } catch (e2) {
            onAlert?.('Open link failed', e2.message);
            return;
          }
        }
        onAlert?.('Open link failed', err.message);
      }
    },
    [api, loadDocRaw, onAlert],
  );

  const openFromUrl = useCallback(
    async (mode = 'replace') => {
      if (typeof window === 'undefined') return;
      
      // If no URL params, try to restore from localStorage first
      restoreLastUrl();
      
      const params = new URLSearchParams(window.location.search || '');
      const id = String(params.get('id') || '').trim();
      const rel = String(params.get('doc') || '').trim();
      
      if (!id && !rel) return;
      const decodedRel = rel ? decodeURIComponent(rel) : rel;
      try {
        if (id) await openDocByStableId(id, { fallbackRelPath: decodedRel }, { urlMode: mode === 'push' ? 'push' : 'none' });
        else
          await loadDocRaw(
            { rel_path: decodedRel, description: '', updated_at: new Date().toISOString() },
            { urlMode: mode === 'push' ? 'push' : 'none' },
          );
      } catch (e) {
        setError?.(e?.message || String(e));
      }
    },
    [loadDocRaw, openDocByStableId, setError],
  );

  // Restore selected doc from URL on first load (only after folders have loaded).
  useEffect(() => {
    if (!foldersLoaded) return;
    openFromUrl('replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersLoaded]);

  // Back/forward navigation support.
  useEffect(() => {
    if (!foldersLoaded) return;
    const onPopState = () => {
      openFromUrl('replace');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [foldersLoaded, openFromUrl]);

  const currentSpace = useMemo(() => {
    const rel = state.selectedDoc?.rel_path;
    if (!rel) return '';
    return String(rel).split('/')[0] || '';
  }, [state.selectedDoc?.rel_path]);

  const isNewerUpdatedAt = (a, b) => {
    const ta = Date.parse(a || '');
    const tb = Date.parse(b || '');
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta > tb;
    return String(a || '') > String(b || '');
  };

  const computeLineChangeSnippet = (localText, remoteText, context = 3) => {
    const a = String(localText ?? '').replace(/\r\n/g, '\n').split('\n');
    const b = String(remoteText ?? '').replace(/\r\n/g, '\n').split('\n');
    const min = Math.min(a.length, b.length);
    let start = 0;
    while (start < min && a[start] === b[start]) start += 1;
    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
      endA -= 1;
      endB -= 1;
    }
    const aFrom = Math.max(0, start - context);
    const bFrom = Math.max(0, start - context);
    const aTo = Math.min(a.length, endA + 1 + context);
    const bTo = Math.min(b.length, endB + 1 + context);
    return {
      startLine: start + 1,
      local: a.slice(aFrom, aTo).join('\n'),
      remote: b.slice(bFrom, bTo).join('\n'),
    };
  };

  const ensureLatestBeforeEdit = useCallback(async () => {
    const selectedDoc = stateRef.current.selectedDoc;
    const docContent = stateRef.current.docContent;
    const diffGate = stateRef.current.diffGate;
    if (!selectedDoc?.rel_path) return true;
    if (editGateInFlightRef.current) return false;
    if (diffGate) return false;
    if (hasPendingChanges && !isHydratingContentRef.current) return true;

    editGateInFlightRef.current = true;
    let openedDiffGate = false;
    try {
      const meta = await api.getDocMeta(selectedDoc.rel_path);
      const remoteUpdatedAt = meta?.updated_at;
      const localUpdatedAt = selectedDoc.updated_at;
      if (!remoteUpdatedAt || !localUpdatedAt || !isNewerUpdatedAt(remoteUpdatedAt, localUpdatedAt)) {
        editGateInFlightRef.current = false;
        return true;
      }

      if (!hasPendingChanges || isHydratingContentRef.current) {
        await loadDocRaw({ ...selectedDoc, updated_at: remoteUpdatedAt, description: meta?.description ?? selectedDoc.description });
        editGateInFlightRef.current = false;
        return true;
      }

      const { content: remoteContent } = await api.getDocContent(selectedDoc.rel_path);
      setDiffGate({
        rel_path: selectedDoc.rel_path,
        remoteUpdatedAt,
        local: docContent,
        remote: remoteContent,
        snippet: computeLineChangeSnippet(docContent, remoteContent),
      });
      openedDiffGate = true;
      return false;
    } catch {
      editGateInFlightRef.current = false;
      return true;
    } finally {
      if (!openedDiffGate) editGateInFlightRef.current = false;
    }
  }, [api, hasPendingChanges, loadDocRaw, setDiffGate]);

  const checkForRemoteUpdatesOnce = useCallback(async () => {
    const selectedDoc = stateRef.current.selectedDoc;
    if (!selectedDoc?.rel_path) return;
    try {
      const meta = await api.getDocMeta(selectedDoc.rel_path);
      const remoteUpdatedAt = meta?.updated_at;
      const localUpdatedAt = selectedDoc.updated_at;
      if (remoteUpdatedAt && localUpdatedAt && isNewerUpdatedAt(remoteUpdatedAt, localUpdatedAt)) {
        if (!hasPendingChanges && !isHydratingContentRef.current) {
          await loadDocRaw({ ...selectedDoc, updated_at: remoteUpdatedAt, description: meta?.description ?? selectedDoc.description });
        }
      }
    } catch {
      // ignore
    }
  }, [api, hasPendingChanges, loadDocRaw]);

  const checkSpaceNewDocsOnce = useCallback(async () => {
    if (!currentSpace) {
      setSpaceNewDocs(null);
      lastSpaceSnapshotRef.current = { space: '', relPaths: new Set() };
      return;
    }
    try {
      const docs = await api.listDocs(currentSpace, true);
      const currentSet = new Set((docs || []).map((d) => d?.rel_path).filter(Boolean));
      const prev = lastSpaceSnapshotRef.current;

      if (prev.space !== currentSpace) {
        lastSpaceSnapshotRef.current = { space: currentSpace, relPaths: currentSet };
        setSpaceNewDocs(null);
        return;
      }

      let addedCount = 0;
      let latestRelPath = '';
      currentSet.forEach((p) => {
        if (!prev.relPaths.has(p)) {
          addedCount += 1;
          latestRelPath = p;
        }
      });
      if (addedCount > 0) {
        setSpaceNewDocs({ space: currentSpace, count: addedCount, latestRelPath });
      }
      lastSpaceSnapshotRef.current = { space: currentSpace, relPaths: currentSet };
    } catch {
      // ignore
    }
  }, [api, currentSpace]);

  useEffect(() => {
    const onFocus = () => {
      checkForRemoteUpdatesOnce();
      checkSpaceNewDocsOnce();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForRemoteUpdatesOnce();
        checkSpaceNewDocsOnce();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkForRemoteUpdatesOnce, checkSpaceNewDocsOnce]);

  return {
    selectedDoc: state.selectedDoc,
    setSelectedDoc,
    docContent: state.docContent,
    setDocContent,
    isLoadingContent: state.isLoadingContent,
    diffGate: state.diffGate,
    setDiffGate,
    spaceNewDocs: state.spaceNewDocs,
    setSpaceNewDocs,
    currentSpace,
    editorScrollRef,
    isHydratingContentRef,
    lastSavedContentRef,
    editGateInFlightRef,
    lastSpaceSnapshotRef,
    getStableId,
    updateUrlForDoc,
    loadDocRaw,
    openDocByStableId,
    openFromUrl,
    ensureLatestBeforeEdit,
    checkForRemoteUpdatesOnce,
    checkSpaceNewDocsOnce,
  };
}


