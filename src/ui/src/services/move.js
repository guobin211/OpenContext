import { basename, dirname, isDescendantPath, rewritePrefix } from '../utils/path.js';

export { basename, dirname, isDescendantPath, rewritePrefix };

/**
 * @typedef {import('../types').Doc} Doc
 */

export function rewriteFolderDocsCache(prev, sourcePath, newPath) {
  const next = { ...(prev || {}) };
  Object.keys(next).forEach((k) => {
    if (k === sourcePath) {
      next[newPath] = next[k];
      delete next[k];
      return;
    }
    if (String(k).startsWith(`${sourcePath}/`)) {
      const rewritten = `${newPath}${String(k).slice(sourcePath.length)}`;
      next[rewritten] = next[k];
      delete next[k];
    }
  });
  return next;
}

export function rewriteExpandedFolders(prevSet, sourcePath, newPath, targetFolderPath) {
  const next = new Set();
  (prevSet || new Set()).forEach((p) => {
    next.add(rewritePrefix(p, sourcePath, newPath));
  });
  if (targetFolderPath) next.add(targetFolderPath);
  return next;
}

/**
 * @param {Doc|null|undefined} prevSelectedDoc
 * @param {string} sourcePath
 * @param {string} newPath
 * @returns {Doc|null|undefined}
 */
export function rewriteSelectedDocAfterFolderMove(prevSelectedDoc, sourcePath, newPath) {
  const rel = prevSelectedDoc?.rel_path;
  if (!rel) return prevSelectedDoc;
  const rewritten = rewritePrefix(rel, sourcePath, newPath);
  if (rewritten === rel) return prevSelectedDoc;
  return { ...prevSelectedDoc, rel_path: rewritten };
}

/**
 * @param {{api: any, docRelPath: string, targetFolderPath: string}} params
 * @returns {Promise<{folders:any[], oldParentPath:string, targetFolderPath:string, newRelPath:string}>}
 */
export async function moveDocFlow({ api, docRelPath, targetFolderPath }) {
  if (!docRelPath) throw new Error('Missing doc path');
  if (!targetFolderPath) throw new Error('Root is not supported. Please specify a folder under contexts/.');

  const oldParentPath = dirname(docRelPath);
  const result = await api.moveDoc(docRelPath, targetFolderPath);
  const newRelPath = result?.new_path || `${targetFolderPath}/${basename(docRelPath)}`;
  const folders = await api.listFolders({ all: true });
  return {
    folders,
    oldParentPath,
    targetFolderPath,
    newRelPath,
  };
}

/**
 * @param {{api: any, sourcePath: string, targetFolderPath: string}} params
 * @returns {Promise<{folders:any[], newPath:string, targetFolderPath:string}>}
 */
export async function moveFolderFlow({ api, sourcePath, targetFolderPath }) {
  if (!sourcePath) throw new Error('Missing folder path');
  if (!targetFolderPath) throw new Error('Root is not supported. Please specify a folder under contexts/.');
  if (isDescendantPath(sourcePath, targetFolderPath)) {
    throw new Error('Cannot move a folder into itself or its descendants.');
  }

  const result = await api.moveFolder(sourcePath, targetFolderPath);
  const oldName = basename(sourcePath);
  const newPath = result?.new_path || `${targetFolderPath}/${oldName}`;
  const folders = await api.listFolders({ all: true });
  return { folders, newPath, targetFolderPath };
}


