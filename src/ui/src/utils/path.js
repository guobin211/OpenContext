export function basename(relPath) {
  const parts = String(relPath || '').split('/');
  return parts[parts.length - 1] || '';
}

export function dirname(relPath) {
  return String(relPath || '').split('/').slice(0, -1).join('/');
}

export function stripExt(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return s;
  return s.slice(0, i);
}

export function isDescendantPath(parent, child) {
  const p = String(parent || '').trim();
  const c = String(child || '').trim();
  if (!p || !c) return false;
  if (p === c) return true;
  return c.startsWith(`${p}/`);
}

export function rewritePrefix(path, oldPrefix, newPrefix) {
  const p = String(path || '');
  const oldP = String(oldPrefix || '');
  const newP = String(newPrefix || '');
  if (!oldP) return p;
  if (p === oldP) return newP;
  if (p.startsWith(`${oldP}/`)) return `${newP}${p.slice(oldP.length)}`;
  return p;
}


