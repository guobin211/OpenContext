/**
 * List + CodeBlock compatibility normalizer for Plate editor.
 *
 * ## Design Intent
 * When using `@platejs/list-classic` with code blocks and drag-and-drop, several edge cases
 * require special handling to maintain a good user experience:
 *
 * 1. **Code block dragged INTO a list**: Plate's list schema doesn't allow code blocks inside
 *    list items. Without intervention, the code block gets normalized to a paragraph ("style lost").
 *    We instead move the code block OUT of the list boundary.
 *
 * 2. **Code block in the middle of a list**: If a code block lands between list items, we split
 *    the list into two separate lists with the code block between them.
 *
 * 3. **Ordered list continuation**: When an ordered list is split by a code block specifically,
 *    the second list should continue numbering from where the first list left off.
 *    (Other blocks like headings will cause the list to restart from 1.)
 *
 * 4. **Trailing paragraph**: If the document ends with a code block, list, or table, the user
 *    cannot place their cursor after it. We automatically append an empty paragraph.
 *
 * ## Structure Examples
 *
 * Before (code block inside list):
 * ```
 * ul
 * ├── li
 * ├── code_block  <-- Invalid position
 * └── li
 * ```
 *
 * After (code block moved out, list split):
 * ```
 * ul
 * └── li
 * code_block
 * ul
 * └── li
 * ```
 *
 * ## Usage
 * ```js
 * import { installListCompatNormalize } from './normalize/listCompatNormalize';
 *
 * useEffect(() => {
 *   installListCompatNormalize(editor);
 *   Editor.normalize(editor, { force: true });
 * }, [editor]);
 * ```
 */

import { Transforms, Path, Editor } from 'slate';
import { getNodeTypes, isListContainer, isOrderedList, getListStart, countListItems } from '../nodeTypes';

/**
 * Install the list/codeblock compatibility normalizer on the editor.
 * Safe to call multiple times (idempotent).
 *
 * @param {import('platejs/react').PlateEditor} editor - Plate editor instance
 * @returns {import('platejs/react').PlateEditor} - The editor (for chaining)
 */
export function installListCompatNormalize(editor) {
  if (!editor || editor.__ocListCompatNormalizeInstalled) return editor;
  editor.__ocListCompatNormalizeInstalled = true;

  const { normalizeNode } = editor;
  const types = getNodeTypes(editor);

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    // --- Rule 1: Code block inside a list container ---
    // Move it out (before/after) or split the list if it's in the middle.
    if (isListContainer(node, types) && Array.isArray(node?.children) && path.length > 0) {
      const codeBlockIdx = node.children.findIndex(
        (c) => c?.type === types.codeBlock || c?.type === 'code_block'
      );

      if (codeBlockIdx !== -1) {
        const handled = handleCodeBlockInList(editor, node, path, codeBlockIdx, types);
        if (handled) return;
      }
    }

    // --- Rule 2: Code block inside list item content (lic) ---
    // Move it to be a sibling under the parent li.
    if (node?.type === types.lic && Array.isArray(node?.children)) {
      const codeBlockIdx = node.children.findIndex(
        (c) => c?.type === types.codeBlock || c?.type === 'code_block'
      );

      if (codeBlockIdx !== -1) {
        const licIndex = path[path.length - 1];
        const liPath = Path.parent(path);
        Transforms.moveNodes(editor, {
          at: path.concat(codeBlockIdx),
          to: liPath.concat(licIndex + 1),
        });
        return;
      }
    }

    // --- Rule 3: Root-level adjustments ---
    if (path.length === 0 && Array.isArray(node?.children) && node.children.length > 0) {
      // 3a: Ordered list continuation (ol + block + ol pattern)
      const continuationHandled = handleOrderedListContinuation(editor, node, types);
      if (continuationHandled) return;

      // 3b: Trailing paragraph after code block/list/table
      const trailingHandled = handleTrailingParagraph(editor, node, types);
      if (trailingHandled) return;
    }

    // Fall through to default normalize
    normalizeNode(entry);
  };

  return editor;
}

/**
 * Handle code block found inside a list container.
 * @returns {boolean} - True if the situation was handled (caller should return early)
 */
function handleCodeBlockInList(editor, listNode, listPath, codeBlockIdx, types) {
  const listIndex = listPath[listPath.length - 1];
  const parentPath = Path.parent(listPath);
  const isAtStart = codeBlockIdx === 0;
  const isAtEnd = codeBlockIdx === listNode.children.length - 1;

  // If code block is in the middle, split the list
  if (!isAtStart && !isAtEnd) {
    try {
      return splitListAtCodeBlock(editor, listNode, listPath, codeBlockIdx, types);
    } catch {
      // Fall through to simple move
    }
  }

  // Move code block before (if at start) or after (if at end) the list
  const toIndex = isAtStart ? listIndex : listIndex + 1;
  Transforms.moveNodes(editor, {
    at: listPath.concat(codeBlockIdx),
    to: parentPath.concat(toIndex),
  });
  return true;
}

/**
 * Split a list at the code block position.
 * @returns {boolean} - True if handled successfully
 */
function splitListAtCodeBlock(editor, listNode, listPath, codeBlockIdx, types) {
  const listType = listNode.type;
  const listIndex = listPath[listPath.length - 1];
  const parentPath = Path.parent(listPath);

  // Compute continuation start for ordered lists BEFORE splitting
  const baseStart = getListStart(listNode);
  const itemCountBefore = countListItems(
    { children: listNode.children.slice(0, codeBlockIdx) },
    types
  );
  const continuedStart = baseStart + itemCountBefore;

  // Split the list at the code block position
  Transforms.splitNodes(editor, {
    at: listPath.concat(codeBlockIdx),
    match: (n) => n?.type === listType,
    always: true,
  });

  // Move the code block (now first child of second list) out between the two lists
  const secondListPath = Path.next(listPath);
  Transforms.moveNodes(editor, {
    at: secondListPath.concat(0),
    to: parentPath.concat(listIndex + 1),
  });

  // After inserting the code block, the second list shifts by +1
  const shiftedSecondListPath = parentPath.concat(listIndex + 2);

  // Set continuation start for ordered lists
  if (isOrderedList({ type: listType }, types) && continuedStart > 1) {
    Transforms.setNodes(
      editor,
      { start: continuedStart, listStart: continuedStart },
      { at: shiftedSecondListPath }
    );
  }

  // If the second list becomes empty, remove it
  try {
    const secondListNode = Editor.node(editor, shiftedSecondListPath)?.[0];
    if (secondListNode && Array.isArray(secondListNode.children) && secondListNode.children.length === 0) {
      Transforms.removeNodes(editor, { at: shiftedSecondListPath });
    }
  } catch {
    // Node may not exist, ignore
  }

  return true;
}

/**
 * Handle ordered list continuation: ol + codeBlock + ol pattern.
 * Ensures the second ol has the correct `start` value.
 * ONLY applies when the middle element is a code block (not headings or other blocks).
 * @returns {boolean} - True if any adjustment was made
 */
function handleOrderedListContinuation(editor, rootNode, types) {
  try {
    for (let i = 2; i < rootNode.children.length; i += 1) {
      const curr = rootNode.children[i];
      const prev = rootNode.children[i - 1];
      const prev2 = rootNode.children[i - 2];

      // Check if we have ol + codeBlock + ol pattern
      if (!isOrderedList(curr, types)) continue;
      if (!isOrderedList(prev2, types)) continue;
      
      // Middle must be a code block specifically (not any non-list block)
      const isCodeBlock = prev?.type === types.codeBlock || prev?.type === 'code_block';
      if (!isCodeBlock) continue;

      // Calculate expected start
      const prev2Start = getListStart(prev2);
      const prev2Count = countListItems(prev2, types);
      const expectedStart = prev2Start + prev2Count;

      // Get current start
      const currStart = getListStart(curr);

      // Update if different
      if (currStart !== expectedStart) {
        Transforms.setNodes(
          editor,
          { start: expectedStart, listStart: expectedStart },
          { at: [i] }
        );
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Ensure a trailing paragraph exists after code block/list/table at document end.
 * @returns {boolean} - True if a paragraph was inserted
 */
function handleTrailingParagraph(editor, rootNode, types) {
  const last = rootNode.children[rootNode.children.length - 1];

  const needsTrailingParagraph =
    last?.type === types.codeBlock ||
    last?.type === 'code_block' ||
    isListContainer(last, types) ||
    last?.type === types.table ||
    last?.type === 'table';

  if (needsTrailingParagraph) {
    Transforms.insertNodes(
      editor,
      { type: types.p, children: [{ text: '' }] },
      { at: [rootNode.children.length] }
    );
    return true;
  }

  return false;
}

export default installListCompatNormalize;

