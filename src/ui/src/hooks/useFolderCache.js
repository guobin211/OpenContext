import { useCallback, useEffect, useReducer, useRef } from 'react';

export function useFolderCache({ api, onError }) {
  const initial = useRef({
    folders: [],
    folderDocs: {},
    expandedFolders: new Set(),
    foldersLoaded: false,
  }).current;

  function reducer(state, action) {
    switch (action.type) {
      case 'LOAD_FOLDERS_SUCCESS':
        return { ...state, folders: action.folders || [] };
      case 'LOAD_FOLDERS_FINISH':
        return { ...state, foldersLoaded: true };
      case 'SET_FOLDERS':
        return { ...state, folders: action.folders || [] };
      case 'SET_FOLDER_DOCS':
        return { ...state, folderDocs: { ...state.folderDocs, [action.folderPath]: action.docs || [] } };
      case 'SET_FOLDER_DOCS_RAW':
        return { ...state, folderDocs: action.folderDocs || {} };
      case 'SET_EXPANDED_FOLDERS':
        return { ...state, expandedFolders: action.expandedFolders || new Set() };
      default:
        return state;
    }
  }

  const [state, dispatch] = useReducer(reducer, initial);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listFolders({ all: true });
        dispatch({ type: 'LOAD_FOLDERS_SUCCESS', folders: data });
      } catch (err) {
        onError?.(err);
      } finally {
        dispatch({ type: 'LOAD_FOLDERS_FINISH' });
      }
    })();
  }, [api, onError]);

  const setFolders = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.folders;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_FOLDERS', folders: next });
  }, []);

  const setFolderDocs = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.folderDocs;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_FOLDER_DOCS_RAW', folderDocs: next });
  }, []);

  const setExpandedFolders = useCallback((valueOrUpdater) => {
    const prev = stateRef.current.expandedFolders;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    dispatch({ type: 'SET_EXPANDED_FOLDERS', expandedFolders: next });
  }, []);

  const refreshFolder = useCallback(
    async (folderPath) => {
      try {
        const docs = await api.listDocs(folderPath);
        dispatch({ type: 'SET_FOLDER_DOCS', folderPath, docs });
      } catch (err) {
        // keep silent like previous behavior
        console.error(err);
      }
    },
    [api],
  );

  const toggleFolder = useCallback(
    async (folderPath) => {
      const isExpanded = stateRef.current.expandedFolders.has(folderPath);
      const next = new Set(stateRef.current.expandedFolders);
      if (isExpanded) next.delete(folderPath);
      else next.add(folderPath);
      dispatch({ type: 'SET_EXPANDED_FOLDERS', expandedFolders: next });

      if (!isExpanded && !stateRef.current.folderDocs[folderPath]) {
        await refreshFolder(folderPath);
      }
    },
    [refreshFolder],
  );

  const refreshSidebarAll = useCallback(async () => {
    try {
      const data = await api.listFolders({ all: true });
      dispatch({ type: 'SET_FOLDERS', folders: data });

      const targets = new Set(stateRef.current.expandedFolders);
      for (const p of targets) {
        // eslint-disable-next-line no-await-in-loop
        await refreshFolder(p);
      }
    } catch (err) {
      onError?.(err);
    }
  }, [api, onError, refreshFolder]);

  const refreshSidebarForSpace = useCallback(
    async (space) => {
      if (!space) return;
      try {
        const data = await api.listFolders({ all: true });
        dispatch({ type: 'SET_FOLDERS', folders: data });

        const targets = new Set([space]);
        stateRef.current.expandedFolders.forEach((p) => {
          if (p === space || String(p).startsWith(`${space}/`)) targets.add(p);
        });
        for (const p of targets) {
          // eslint-disable-next-line no-await-in-loop
          await refreshFolder(p);
        }
      } catch (err) {
        onError?.(err);
      }
    },
    [api, onError, refreshFolder],
  );

  return {
    folders: state.folders,
    setFolders,
    folderDocs: state.folderDocs,
    setFolderDocs,
    expandedFolders: state.expandedFolders,
    setExpandedFolders,
    foldersLoaded: state.foldersLoaded,
    refreshFolder,
    toggleFolder,
    refreshSidebarAll,
    refreshSidebarForSpace,
  };
}


