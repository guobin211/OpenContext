/**
 * Centralized node type mappings for Plate editor.
 *
 * Why this file exists:
 * - list-classic plugin may use different type keys (e.g., KEYS.olClassic vs 'ol')
 * - Scattered `editor.getType?.(KEYS.xxx) || 'fallback'` patterns are error-prone
 * - This module provides a single source of truth for all node type lookups
 *
 * Usage:
 *   import { getNodeTypes } from '../editor/nodeTypes';
 *   const types = getNodeTypes(editor);
 *   if (node.type === types.ol) { ... }
 */

import { KEYS } from 'platejs';

/**
 * @typedef {object} NodeTypes
 * @property {string} p - Paragraph
 * @property {string} codeBlock - Code block
 * @property {string} codeLine - Code line (inside code block)
 * @property {string} ul - Unordered list (list-classic)
 * @property {string} ol - Ordered list (list-classic)
 * @property {string} taskList - Task list (list-classic)
 * @property {string} li - List item
 * @property {string} lic - List item content
 * @property {string} table - Table
 * @property {string} tr - Table row
 * @property {string} td - Table cell
 * @property {string} th - Table header cell
 * @property {string} link - Link
 * @property {string} hr - Horizontal rule
 * @property {string} blockquote - Blockquote
 * @property {string} h1 - Heading 1
 * @property {string} h2 - Heading 2
 * @property {string} h3 - Heading 3
 */

/**
 * Get all node types with proper fallbacks.
 * @param {import('platejs/react').PlateEditor} [editor] - Plate editor instance
 * @returns {NodeTypes}
 */
export function getNodeTypes(editor) {
  const getType = (key, fallback) => editor?.getType?.(key) || key || fallback;

  return {
    // Basic blocks
    p: getType(KEYS.p, 'p'),
    blockquote: getType(KEYS.blockquote, 'blockquote'),
    hr: getType(KEYS.hr, 'hr'),

    // Headings
    h1: getType(KEYS.h1, 'h1'),
    h2: getType(KEYS.h2, 'h2'),
    h3: getType(KEYS.h3, 'h3'),

    // Code block
    codeBlock: getType(KEYS.codeBlock, 'code_block'),
    codeLine: getType(KEYS.codeLine, 'code_line'),

    // List (list-classic)
    ul: getType(KEYS.ulClassic, 'ul'),
    ol: getType(KEYS.olClassic, 'ol'),
    taskList: getType(KEYS.taskList, 'taskList'),
    li: getType(KEYS.li, 'li'),
    lic: 'lic', // list item content (always 'lic' in list-classic)

    // Table
    table: getType(KEYS.table, 'table'),
    tr: getType(KEYS.tr, 'tr'),
    td: getType(KEYS.td, 'td'),
    th: getType(KEYS.th, 'th'),

    // Inline
    link: getType(KEYS.link, 'a'),
  };
}

/**
 * Check if a node is a list container (ul, ol, or taskList).
 * @param {object} node - Slate node
 * @param {NodeTypes} types - Node types from getNodeTypes()
 * @returns {boolean}
 */
export function isListContainer(node, types) {
  if (!node?.type) return false;
  return (
    node.type === types.ul ||
    node.type === types.ol ||
    node.type === types.taskList ||
    node.type === 'ul' ||
    node.type === 'ol' ||
    node.type === 'taskList'
  );
}

/**
 * Check if a node is an ordered list.
 * @param {object} node - Slate node
 * @param {NodeTypes} types - Node types from getNodeTypes()
 * @returns {boolean}
 */
export function isOrderedList(node, types) {
  if (!node?.type) return false;
  return node.type === types.ol || node.type === 'ol';
}

/**
 * Check if a node is an unordered list.
 * @param {object} node - Slate node
 * @param {NodeTypes} types - Node types from getNodeTypes()
 * @returns {boolean}
 */
export function isUnorderedList(node, types) {
  if (!node?.type) return false;
  return node.type === types.ul || node.type === 'ul';
}

/**
 * Check if a node is a task list.
 * @param {object} node - Slate node
 * @param {NodeTypes} types - Node types from getNodeTypes()
 * @returns {boolean}
 */
export function isTaskList(node, types) {
  if (!node?.type) return false;
  return node.type === types.taskList || node.type === 'taskList';
}

/**
 * Get the `start` value from an ordered list node.
 * Handles both `start` and `listStart` properties.
 * @param {object} node - Ordered list node
 * @returns {number} - Start value (defaults to 1)
 */
export function getListStart(node) {
  if (typeof node?.start === 'number' && Number.isFinite(node.start)) {
    return node.start;
  }
  if (typeof node?.listStart === 'number' && Number.isFinite(node.listStart)) {
    return node.listStart;
  }
  return 1;
}

/**
 * Count list items in a list container.
 * @param {object} node - List container node
 * @param {NodeTypes} types - Node types from getNodeTypes()
 * @returns {number}
 */
export function countListItems(node, types) {
  if (!Array.isArray(node?.children)) return 0;
  return node.children.filter((c) => c?.type === types.li || c?.type === 'li').length;
}

