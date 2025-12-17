/**
 * Keyboard handlers for the Plate editor.
 *
 * ## Design
 * - Extracted from PlateMarkdown.jsx for better maintainability
 * - Configurable behavior through options
 * - Each handler returns true if it handled the event, false otherwise
 */

import { Range, Editor, Transforms, Path } from 'slate';
import { getNodeTypes } from './nodeTypes';

/**
 * Configuration options for keyboard handlers.
 * @typedef {object} KeyboardConfig
 * @property {boolean} [exitCodeBlockOnEmptyLastLine=true] - Exit code block when pressing Enter on empty last line
 * @property {boolean} [exitCodeBlockOnDoubleEnter=false] - Exit code block on double Enter (not yet implemented)
 */

/** @type {KeyboardConfig} */
export const DEFAULT_KEYBOARD_CONFIG = {
  exitCodeBlockOnEmptyLastLine: true,
  exitCodeBlockOnDoubleEnter: false,
};

/**
 * Handle Enter key in code block.
 * Insert a new code_line within the code block at the cursor position.
 *
 * @param {KeyboardEvent} event - The keyboard event
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @param {KeyboardConfig} [config] - Configuration options (unused, kept for API compatibility)
 * @returns {boolean} - True if the event was handled
 */
export function handleCodeBlockEnter(event, editor, config = DEFAULT_KEYBOARD_CONFIG) {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false;

  try {
    const sel = editor?.selection;
    if (!sel || !Range.isCollapsed(sel)) return false;

    const types = getNodeTypes(editor);
    
    // Check if we're inside a code block
    const codeEntry = editor.api?.above?.({
      at: sel,
      match: (n) => n?.type === types.codeBlock || n?.type === 'code_block',
    });

    if (!codeEntry) return false;

    // Insert a new line within the code block
    event.preventDefault();
    
    // Split the current node at the cursor position
    Transforms.splitNodes(editor, { always: true });
    
    return true;
  } catch (e) {
    console.error('handleCodeBlockEnter error:', e);
    return false;
  }
}

/**
 * Handle Backspace key in code block.
 * When pressing Backspace in an empty code block (only one empty line), delete the entire code block.
 * When pressing Backspace at the start of the first line, also delete the code block.
 *
 * @param {KeyboardEvent} event - The keyboard event
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @returns {boolean} - True if the event was handled
 */
export function handleCodeBlockBackspace(event, editor) {
  if (event.key !== 'Backspace') return false;
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false;

  try {
    const sel = editor?.selection;
    if (!sel || !Range.isCollapsed(sel)) return false;

    const types = getNodeTypes(editor);
    const codeEntry = editor.api?.above?.({
      at: sel,
      match: { type: types.codeBlock },
    });

    if (!codeEntry) return false;

    const [codeNode, codePath] = codeEntry;
    const children = codeNode?.children;
    if (!Array.isArray(children)) return false;

    // Get total text in code block
    const totalText = Editor.string(editor, codePath);
    const isEmpty = String(totalText || '').trim() === '';

    // Case 1: Code block is completely empty - delete it
    if (isEmpty) {
      event.preventDefault();
      
      // Insert an empty paragraph before removing the code block
      Transforms.insertNodes(
        editor,
        { type: types.p, children: [{ text: '' }] },
        { at: codePath }
      );
      
      // Remove the code block (now at next position)
      const codeBlockNewPath = Path.next(codePath);
      Transforms.removeNodes(editor, { at: codeBlockNewPath });
      
      // Select the new paragraph
      Transforms.select(editor, Editor.start(editor, codePath));
      return true;
    }

    // Case 2: Cursor is at the very start of the code block
    const firstLinePath = codePath.concat(0);
    const cursorAtStart = 
      sel.anchor.offset === 0 &&
      (Path.equals(sel.anchor.path, firstLinePath) ||
       (sel.anchor.path.length > firstLinePath.length &&
        Path.isDescendant(sel.anchor.path, firstLinePath) &&
        sel.anchor.path[sel.anchor.path.length - 1] === 0));

    // Check if we're at the absolute start of the first line
    if (cursorAtStart) {
      const firstLineText = Editor.string(editor, firstLinePath);
      
      // Only delete if first line is empty (user pressed backspace on empty first line)
      if (String(firstLineText || '') === '' && children.length === 1) {
        event.preventDefault();
        
        // Insert an empty paragraph before removing the code block
        Transforms.insertNodes(
          editor,
          { type: types.p, children: [{ text: '' }] },
          { at: codePath }
        );
        
        // Remove the code block
        const codeBlockNewPath = Path.next(codePath);
        Transforms.removeNodes(editor, { at: codeBlockNewPath });
        
        // Select the new paragraph
        Transforms.select(editor, Editor.start(editor, codePath));
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Handle Backspace key AFTER a code block.
 * When cursor is at the start of a paragraph/block right after a code block,
 * pressing Backspace deletes the code block (not merge into it).
 *
 * @param {KeyboardEvent} event - The keyboard event
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @returns {boolean} - True if the event was handled
 */
export function handleBackspaceAfterCodeBlock(event, editor) {
  if (event.key !== 'Backspace') return false;
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false;

  try {
    const sel = editor?.selection;
    if (!sel || !Range.isCollapsed(sel)) return false;

    // Check if cursor is at offset 0 (start of a text node)
    if (sel.anchor.offset !== 0) return false;

    const types = getNodeTypes(editor);

    // Get the current block
    const blockEntry = editor.api?.above?.({
      at: sel,
      match: (n) => Editor.isBlock(editor, n),
    });

    if (!blockEntry) return false;

    const [currentBlock, currentPath] = blockEntry;

    // Must be at the very start of the block
    const blockStart = Editor.start(editor, currentPath);
    if (!Editor.isStart(editor, sel.anchor, currentPath)) return false;

    // Check if there's a previous sibling
    if (currentPath[currentPath.length - 1] === 0) return false; // First child, no previous sibling at this level

    const prevPath = Path.previous(currentPath);
    
    // Get the previous node
    let prevNode;
    try {
      [prevNode] = Editor.node(editor, prevPath);
    } catch {
      return false;
    }

    // Check if previous node is a code block
    const isCodeBlock = prevNode?.type === types.codeBlock || prevNode?.type === 'code_block';
    if (!isCodeBlock) return false;

    // Delete the code block!
    event.preventDefault();
    Transforms.removeNodes(editor, { at: prevPath });
    
    // Cursor will naturally stay in the current position (now shifted)
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle Tab key in list items.
 * When pressing Tab in a list item, use the list plugin's indent/outdent.
 * Shift+Tab will outdent the current list item.
 *
 * @param {KeyboardEvent} event - The keyboard event
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @returns {boolean} - True if the event was handled
 */
export function handleListTabKey(event, editor) {
  if (event.key !== 'Tab') return false;
  if (event.metaKey || event.altKey || event.ctrlKey) return false;

  try {
    const sel = editor?.selection;
    if (!sel || !Range.isCollapsed(sel)) return false;

    const types = getNodeTypes(editor);

    // Check if we're inside a list item (li)
    const liEntry = editor.api?.above?.({
      at: sel,
      match: { type: types.li },
    });

    if (!liEntry) return false;

    // We're in a list item - handle Tab/Shift+Tab
    event.preventDefault();

    if (event.shiftKey) {
      // Shift+Tab: outdent the list item
      try {
        editor.tf?.outdent?.();
      } catch {
        // Fallback: try using list-specific outdent
        try {
          editor.tf?.ol?.outdent?.() || editor.tf?.ul?.outdent?.();
        } catch {
          // Ignore if outdent is not available
        }
      }
    } else {
      // Tab: indent the list item (creates nested list)
      try {
        editor.tf?.indent?.();
      } catch {
        // Fallback: try using list-specific indent
        try {
          editor.tf?.ol?.indent?.() || editor.tf?.ul?.indent?.();
        } catch {
          // Ignore if indent is not available
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Handle Enter key in empty list item.
 * When pressing Enter in an empty list item at the start, outdent or exit the list.
 *
 * @param {KeyboardEvent} event - The keyboard event
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @returns {boolean} - True if the event was handled
 */
export function handleListEnterKey(event, editor) {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false;

  try {
    const sel = editor?.selection;
    if (!sel || !Range.isCollapsed(sel)) return false;

    const types = getNodeTypes(editor);

    // Check if we're inside a list item content (lic)
    const licEntry = editor.api?.above?.({
      at: sel,
      match: { type: 'lic' },
    });

    if (!licEntry) return false;

    const [, licPath] = licEntry;
    const licText = Editor.string(editor, licPath);

    // Only handle if the lic is empty
    if (String(licText || '').trim() !== '') return false;

    // Check if this list item is nested (has a parent li)
    const parentLiEntry = editor.api?.above?.({
      at: licPath,
      match: { type: types.li },
    });

    if (!parentLiEntry) return false;

    const [, liPath] = parentLiEntry;

    // Check if the li is inside another list (nested)
    const parentListEntry = editor.api?.above?.({
      at: liPath,
      match: (n) => n?.type === 'ul' || n?.type === 'ol' || n?.type === 'taskList',
    });

    if (!parentListEntry) return false;

    const [, listPath] = parentListEntry;

    // Check if this list is nested inside another li
    const grandParentLiEntry = editor.api?.above?.({
      at: listPath,
      match: { type: types.li },
    });

    if (grandParentLiEntry) {
      // Nested list - outdent
      event.preventDefault();
      try {
        editor.tf?.outdent?.();
      } catch {
        // If outdent fails, just let default behavior happen
        return false;
      }
      return true;
    }

    // Top-level empty list item - exit list (convert to paragraph)
    // This is handled by the default list-classic behavior, so we don't need to do anything special
    return false;
  } catch {
    return false;
  }
}

/**
 * Create a combined keydown handler for the editor.
 *
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @param {object} callbacks - Additional callbacks
 * @param {Function} [callbacks.onSlashTrigger] - Called when "/" is pressed
 * @param {KeyboardConfig} [config] - Keyboard configuration
 * @returns {(event: KeyboardEvent) => void}
 */
export function createEditorKeyDownHandler(editor, callbacks = {}, config = DEFAULT_KEYBOARD_CONFIG) {
  return (event) => {
    // Handle code block Enter (exit on empty last line)
    if (handleCodeBlockEnter(event, editor, config)) {
      return;
    }

    // Handle code block Backspace (delete empty code block)
    if (handleCodeBlockBackspace(event, editor)) {
      return;
    }

    // Handle Backspace after code block (delete the code block from outside)
    if (handleBackspaceAfterCodeBlock(event, editor)) {
      return;
    }

    // Handle Tab key in list items
    if (handleListTabKey(event, editor)) {
      return;
    }

    // Handle Enter key in empty list items (outdent nested items)
    if (handleListEnterKey(event, editor)) {
      return;
    }

    // Handle slash menu trigger
    if (event.key === '/' && !event.metaKey && !event.altKey && !event.ctrlKey) {
      callbacks.onSlashTrigger?.();
    }
  };
}

export default createEditorKeyDownHandler;

