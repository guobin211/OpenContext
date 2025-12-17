/**
 * Custom Markdown serialization/deserialization rules for Plate editor.
 *
 * ## Why this file exists
 *
 * Plate's `@platejs/markdown` plugin has limited support for `@platejs/list-classic`:
 * - `taskList` nodes throw "Unreachable code" during serialization
 * - Ordered list `start` attribute is not consistently preserved
 * - Nested list structures may serialize incorrectly
 *
 * This module provides custom rules that:
 * 1. Serialize `taskList` to mdast `list` with `listItem.checked`
 * 2. Serialize `ol`/`ul` with proper nested structure and `start` preservation
 * 3. Deserialize mdast `list` back to `taskList`/`ol`/`ul` with `li.checked` and `start`
 *
 * ## Usage
 * ```js
 * import { createMarkdownPlugin } from './plugins/markdownRules';
 * const markdownPlugin = createMarkdownPlugin();
 * ```
 */

import { KEYS } from 'platejs';
import { MarkdownPlugin, convertNodesSerialize, convertChildrenDeserialize } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import { getNodeTypes, getListStart } from '../nodeTypes';

const remarkPlugins = [remarkGfm];

/**
 * Serialize list-classic list items to mdast listItems.
 * Handles nested lists recursively.
 *
 * @param {Array} children - Plate node children
 * @param {object} options - Serialization options (contains editor)
 * @returns {Array} - mdast listItem nodes
 */
function serializeClassicListItems(children, options) {
  const editor = options.editor;
  const types = getNodeTypes(editor);

  const items = [];
  let currentItem = null;

  for (const child of children || []) {
    if (!child || typeof child !== 'object') continue;

    if (child.type === types.li || child.type === 'li') {
      if (currentItem) items.push(currentItem);

      currentItem = {
        type: 'listItem',
        spread: false,
        checked: typeof child.checked === 'boolean' ? child.checked : null,
        children: [],
      };

      for (const liChild of child.children || []) {
        if (!liChild || typeof liChild !== 'object') continue;

        if (liChild.type === types.lic || liChild.type === 'lic') {
          // List item content -> paragraph
          currentItem.children.push({
            type: 'paragraph',
            children: convertNodesSerialize(liChild.children || [], options),
          });
        } else if (
          liChild.type === types.ul ||
          liChild.type === types.ol ||
          liChild.type === types.taskList ||
          liChild.type === 'ul' ||
          liChild.type === 'ol' ||
          liChild.type === 'taskList'
        ) {
          // Nested list
          const isOrdered = liChild.type === types.ol || liChild.type === 'ol';
          const start = isOrdered ? getListStart(liChild) : undefined;

          currentItem.children.push({
            type: 'list',
            ordered: isOrdered,
            spread: false,
            ...(isOrdered && typeof start === 'number' && start !== 1 ? { start } : {}),
            children: serializeClassicListItems(liChild.children || [], options),
          });
        }
      }
    }
  }

  if (currentItem) items.push(currentItem);
  return items;
}

/**
 * Serialize a list-classic list node to mdast list.
 *
 * @param {object} node - Plate list node
 * @param {object} options - Serialization options
 * @param {object} config - { ordered: boolean }
 * @returns {object} - mdast list node
 */
function serializeClassicList(node, options, { ordered }) {
  const start = ordered ? getListStart(node) : undefined;

  return {
    type: 'list',
    ordered: Boolean(ordered),
    spread: false,
    ...(ordered && typeof start === 'number' && start !== 1 ? { start } : {}),
    children: serializeClassicListItems(node.children || [], options),
  };
}

/**
 * Deserialize mdast list to Plate list-classic nodes.
 *
 * @param {object} mdastNode - mdast list node
 * @param {object} deco - Decoration context
 * @param {object} options - Deserialization options
 * @returns {object|undefined} - Plate node or undefined to use default
 */
function deserializeList(mdastNode, deco, options) {
  const editor = options.editor;

  // Only handle when using list-classic (no indent-list plugin)
  if (editor?.plugins?.list) {
    return undefined; // Fall back to default
  }

  const types = getNodeTypes(editor);

  const hasTodoItems = Boolean(
    mdastNode?.children?.some?.(
      (c) => c?.type === 'listItem' && (c.checked === true || c.checked === false)
    )
  );

  // Determine list type
  const listType = hasTodoItems
    ? types.taskList
    : mdastNode.ordered
      ? types.ol
      : types.ul;

  // Handle ordered list start
  const start =
    mdastNode?.ordered &&
    typeof mdastNode.start === 'number' &&
    Number.isFinite(mdastNode.start)
      ? mdastNode.start
      : undefined;

  return {
    type: listType,
    ...(mdastNode?.ordered && typeof start === 'number' && start !== 1
      ? { start, listStart: start }
      : {}),
    children: (mdastNode.children || []).map((child) => {
      if (child?.type === 'listItem') {
        const liChildren = (child.children || []).map((itemChild) => {
          if (itemChild?.type === 'paragraph') {
            return {
              type: types.lic,
              children: convertChildrenDeserialize(itemChild.children || [], deco, options),
            };
          }
          const result = convertChildrenDeserialize([itemChild], deco, options)[0];
          // Ensure we never return undefined - provide fallback
          return result || {
            type: types.lic,
            children: [{ text: '' }],
          };
        }).filter(Boolean); // Filter out any remaining undefined/null

        return {
          type: types.li,
          ...(hasTodoItems && typeof child.checked === 'boolean' ? { checked: child.checked } : {}),
          children: liChildren.length > 0 ? liChildren : [{ type: types.lic, children: [{ text: '' }] }],
        };
      }
      const result = convertChildrenDeserialize([child], deco, options)[0];
      // Ensure we never return undefined
      return result || {
        type: types.li,
        children: [{ type: types.lic, children: [{ text: '' }] }],
      };
    }).filter(Boolean), // Filter out any remaining undefined/null
  };
}

/**
 * Serialize column layout to mdast using HTML.
 * We use HTML div tags with data attributes to preserve column structure.
 * HTML is serialized as a single line to prevent markdown parsers from splitting it.
 *
 * @param {object} node - Plate column_group node
 * @param {object} options - Serialization options
 * @returns {object} - mdast html node
 */
function serializeColumnGroup(node, options) {
  const columnCount = node.children?.length || 2;
  const columnHtmlParts = [];
  
  for (const column of node.children || []) {
    // Check for column type - could be 'column' (KEYS.column) or other variations
    if (column?.type === 'column' || column?.type === KEYS.column || column?.type === 'column_item') {
      // Serialize each column's content to markdown text
      const columnContent = convertNodesSerialize(column.children || [], options);
      // Convert mdast nodes to simple text - escape special chars for HTML
      let contentText = '';
      for (const child of columnContent || []) {
        if (child?.type === 'paragraph' && child.children) {
          contentText += child.children.map(c => c.value || '').join('');
        } else if (child?.type === 'text') {
          contentText += child.value || '';
        }
      }
      // Use data-content attribute to store content, escape HTML entities
      const escapedContent = contentText.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      columnHtmlParts.push(`<div class="oc-column" data-content="${escapedContent}"></div>`);
    }
  }
  
  // Single-line HTML to prevent markdown parser from splitting
  const html = `<div class="oc-columns" data-columns="${columnCount}">${columnHtmlParts.join('')}</div>`;
  
  return {
    type: 'html',
    value: html,
  };
}

/**
 * Serialize individual column - this is handled by the parent columnGroup serializer.
 * Return empty to avoid duplicate serialization.
 *
 * @param {object} node - Plate column node
 * @param {object} options - Serialization options
 * @returns {object} - empty paragraph (content handled by parent)
 */
function serializeColumn(node, options) {
  // Column content is serialized by the parent columnGroup
  // Return null/undefined to skip, or empty paragraph as fallback
  return { type: 'paragraph', children: [] };
}

/**
 * Deserialize HTML column layout back to Plate nodes.
 * Recognizes <div class="oc-columns"> and <div class="oc-column"> patterns.
 * Supports both old format (content inside div) and new format (data-content attribute).
 *
 * @param {object} mdastNode - mdast html node
 * @param {object} deco - Decoration context
 * @param {object} options - Deserialization options
 * @returns {object|undefined} - Plate node or undefined to use default
 */
function deserializeColumnHtml(mdastNode, deco, options) {
  const html = mdastNode?.value || '';
  
  // Skip empty HTML nodes
  if (!html.trim()) {
    return undefined;
  }
  
  // Check if this is our column HTML
  if (!html.includes('class="oc-columns"')) {
    return undefined; // Not our column HTML, use default handling
  }
  
  try {
    // Parse the HTML to extract columns
    const columnMatch = html.match(/data-columns="(\d+)"/);
    const columnCount = columnMatch ? parseInt(columnMatch[1], 10) : 2;
    
    const columns = [];
    
    // Try new format first: <div class="oc-column" data-content="..."></div>
    const newFormatRegex = /<div class="oc-column" data-content="([^"]*)"><\/div>/g;
    let match;
    
    while ((match = newFormatRegex.exec(html)) !== null) {
      // Unescape HTML entities
      const content = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
      
      columns.push({
        type: KEYS.column || 'column',
        width: `${Math.floor(100 / columnCount)}%`,
        children: [
          {
            type: KEYS.p || 'p',
            children: [{ text: content || '' }],
          }
        ],
      });
    }
    
    // Fallback to old format: <div class="oc-column">content</div>
    if (columns.length === 0) {
      const oldFormatRegex = /<div class="oc-column">\s*([\s\S]*?)\s*<\/div>/g;
      while ((match = oldFormatRegex.exec(html)) !== null) {
        const content = match[1].trim();
        columns.push({
          type: KEYS.column || 'column',
          width: `${Math.floor(100 / columnCount)}%`,
          children: [
            {
              type: KEYS.p || 'p',
              children: [{ text: content || '' }],
            }
          ],
        });
      }
    }
    
    // If still no columns found, create empty ones based on columnCount
    if (columns.length === 0) {
      for (let i = 0; i < columnCount; i++) {
        columns.push({
          type: KEYS.column || 'column',
          width: `${Math.floor(100 / columnCount)}%`,
          children: [
            {
              type: KEYS.p || 'p',
              children: [{ text: '' }],
            }
          ],
        });
      }
    }
    
    return {
      type: KEYS.columnGroup || 'column_group',
      children: columns,
    };
  } catch (e) {
    console.error('Failed to deserialize column HTML:', e);
    // Return a valid fallback node instead of undefined
    return {
      type: KEYS.p || 'p',
      children: [{ text: html }],
    };
  }
}

/**
 * Create the Markdown plugin with custom list-classic rules.
 *
 * @returns {ReturnType<typeof MarkdownPlugin.configure>}
 */
export function createMarkdownPlugin() {
  return MarkdownPlugin.configure({
    options: {
      remarkPlugins,
      rules: {
        // Ordered list (list-classic) - handle both type keys
        ol: {
          serialize: (node, options) => serializeClassicList(node, options, { ordered: true }),
        },
        [KEYS.olClassic]: {
          serialize: (node, options) => serializeClassicList(node, options, { ordered: true }),
        },

        // Unordered list (list-classic)
        ul: {
          serialize: (node, options) => serializeClassicList(node, options, { ordered: false }),
        },
        [KEYS.ulClassic]: {
          serialize: (node, options) => serializeClassicList(node, options, { ordered: false }),
        },

        // Task list
        taskList: {
          serialize: (node, options) => serializeClassicList(node, options, { ordered: false }),
        },

        // List deserialization (handles all list types)
        list: {
          deserialize: deserializeList,
        },

        // HTML deserialization (for column layout)
        html: {
          deserialize: deserializeColumnHtml,
        },

        // Column layout support
        // KEYS.columnGroup = "column_group", KEYS.column = "column"
        [KEYS.columnGroup]: {
          serialize: serializeColumnGroup,
        },
        [KEYS.column]: {
          serialize: serializeColumn,
        },
        // Also handle string literals in case KEYS is not available
        column_group: {
          serialize: serializeColumnGroup,
        },
        column: {
          serialize: serializeColumn,
        },
      },
    },
  });
}

export default createMarkdownPlugin;

