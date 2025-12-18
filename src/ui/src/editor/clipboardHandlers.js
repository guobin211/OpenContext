/**
 * Clipboard handlers for the Plate editor.
 * 
 * Provides custom copy/paste handling to ensure clean content serialization
 * without DOM artifacts (like drag handles).
 */

import { Editor } from 'slate';
import { writeClipboardText } from '../utils/clipboard';

/**
 * Create a copy event handler that serializes content as clean markdown.
 * 
 * This prevents DOM elements like drag handles from being included in copied content.
 * Uses both Web Clipboard API and Tauri-compatible clipboard for cross-platform support.
 *
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @param {Function} serializeMarkdown - Function to serialize nodes to markdown
 * @returns {(event: ClipboardEvent) => void}
 */
export function createCopyHandler(editor, serializeMarkdown) {
  return (e) => {
    const { selection } = editor;
    if (!selection) return;

    // Prevent default immediately to stop browser from copying DOM content
    e.preventDefault();

    try {
      // Get the selected fragment from Slate (clean, no DOM extras)
      const fragment = Editor.fragment(editor, selection);
      if (!fragment || fragment.length === 0) return;

      // Serialize the fragment to markdown
      const markdown = serializeMarkdown(editor, fragment);

      // Set clipboard data using Web API
      e.clipboardData?.setData('text/plain', markdown);
      e.clipboardData?.setData('text/html', `<pre>${markdown}</pre>`);

      // Also use Tauri-compatible clipboard API (async, will override if in Tauri)
      writeClipboardText(markdown).catch((err) => {
        console.warn('Tauri clipboard write failed:', err);
      });
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };
}

/**
 * Create a paste event handler that deserializes markdown content.
 * 
 * Detects markdown syntax in pasted text and converts it to Plate nodes.
 * Falls back to default handling for rich HTML or plain text.
 *
 * @param {import('platejs/react').PlateEditor} editor - The Plate editor
 * @param {Function} deserializeMarkdown - Function to deserialize markdown to nodes
 * @param {import('slate').Transforms} Transforms - Slate Transforms
 * @param {object} options - Additional options
 * @param {Function} [options.onError] - Error callback (e.g., show toast)
 * @returns {(event: ClipboardEvent) => void}
 */
export function createPasteHandler(editor, deserializeMarkdown, Transforms, options = {}) {
  return (e) => {
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    const pastedHtml = e.clipboardData?.getData('text/html') || '';

    // Check if pasted text looks like markdown (has markdown syntax)
    const hasMarkdownSyntax = /^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>\s|```|^\|.*\|$|\*\*|__|\*[^*]|_[^_]|~~|`[^`]/m.test(pastedText);

    // Check if HTML contains actual rich formatting tags (not just wrapper divs/spans)
    const hasRichHtmlTags = pastedHtml && /<(h[1-6]|strong|em|b|i|ul|ol|li|blockquote|pre|code|table|a\s)[^>]*>/i.test(pastedHtml);

    // If HTML has real formatting AND no markdown syntax, let Plate handle it
    if (hasRichHtmlTags && !hasMarkdownSyntax) {
      return; // Don't prevent default, let Plate handle rich HTML
    }

    if (pastedText && hasMarkdownSyntax) {
      e.preventDefault();
      e.stopPropagation();
      try {
        // Deserialize markdown to Plate nodes
        const nodes = deserializeMarkdown(editor, pastedText);
        if (nodes && nodes.length > 0) {
          // Insert the deserialized nodes at current selection
          Transforms.insertFragment(editor, nodes);
        }
      } catch (err) {
        console.error('Failed to paste markdown:', err);
        options.onError?.(err);
        // Fallback: insert as plain text
        editor.insertText(pastedText);
      }
      return;
    }
    // If no markdown syntax detected, let Plate handle it as plain text
  };
}

