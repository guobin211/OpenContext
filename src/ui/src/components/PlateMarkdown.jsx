import { useEffect, useRef, useState, useMemo, useCallback, createContext, useContext, memo } from 'react';
import { Plate, PlateContent, PlateElement, usePlateEditor, useEditorRef, useEditorSelection, createPlatePlugin } from 'platejs/react';
import { KEYS } from 'platejs';
import { NodeIdPlugin } from '@platejs/core';
import { BasicBlocksPlugin, BasicMarksPlugin, HorizontalRulePlugin } from '@platejs/basic-nodes/react';
import { TablePlugin, TableRowPlugin, TableCellPlugin, TableCellHeaderPlugin } from '@platejs/table/react';
import { ColumnPlugin, ColumnItemPlugin } from '@platejs/layout/react';
import { insertColumnGroup as insertColumnGroupTransform } from '@platejs/layout';
import { IndentPlugin } from '@platejs/indent/react';
import {
  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  TaskListPlugin,
  ListItemPlugin,
  ListItemContentPlugin,
} from '@platejs/list-classic/react';
import { LinkPlugin } from '@platejs/link/react';
import { AutoformatPlugin } from '@platejs/autoformat';
// Using dnd-kit instead of react-dnd for better Tauri/WKWebView compatibility
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Range, Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import { insertLink } from '@platejs/link';
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from '@platejs/code-block/react';
import { TrailingBlockPlugin } from '@platejs/utils';
import { all, createLowlight } from 'lowlight';
import * as api from '../api';

// --- Editor modules (P0 refactor) ---
import { installListCompatNormalize } from '../editor/normalize/listCompatNormalize';
import { createMarkdownPlugin } from '../editor/plugins/markdownRules';

// --- Editor components (P1 refactor) ---
import CodeBlockElement from '../editor/components/CodeBlockElement';
import SlashMenu from '../editor/components/SlashMenu';
import { FloatingToolbar, TableFloatingToolbar } from '../editor/components/Toolbars';
import { useTranslation } from 'react-i18next';

// --- Editor utilities (P2 refactor) ---
import { createEditorKeyDownHandler } from '../editor/keyboardHandlers';
import { createCopyHandler, createPasteHandler } from '../editor/clipboardHandlers';

// Create markdown plugin instance
const markdownPlugin = createMarkdownPlugin();

// --- Drag & Drop (blocks) using dnd-kit ---
// Ref to temporarily disable DnD during bulk operations (e.g., delete all)
const dndDisabledRef = { current: false };

// Context to share active drag state across the editor
const EditorDndContext = createContext({
  activeDragId: null,
  activeDragData: null,
  dropTargetId: null,
  dropPosition: null, // 'before' | 'after'
  dndDisabled: false,
});

// Hook to access editor dnd context
const useEditorDnd = () => useContext(EditorDndContext);

// Types that should never have drag handles (performance optimization)
const NON_DRAGGABLE_TYPES = new Set(['tr', 'td', 'th', 'lic', 'ul', 'ol', 'taskList', 'code_line']);

// Block wrapper that provides drag handle and drop zones
const BlockDraggable = () => (props) => <BlockDraggableElement {...props} />;

// Memoized drag handle component to prevent unnecessary re-renders
const DragHandle = memo(({ dragRef, attributes, listeners, title, positionClass }) => (
  <button
    type="button"
    ref={dragRef}
    {...attributes}
    {...listeners}
    title={title}
    contentEditable={false}
    tabIndex={-1}
    className={`absolute ${positionClass} top-[0.15em] z-10 h-6 w-6 rounded border border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing select-none`}
    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    onMouseDown={(e) => e.stopPropagation()}
  >
    <span className="block leading-none text-sm select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>⋮⋮</span>
  </button>
));

const BlockDraggableElement = memo(({ children, element, path }) => {
  const { t } = useTranslation();
  const editor = useEditorRef();
  const { activeDragId, dropPosition } = useEditorDnd();

  // Quick bail-out for non-draggable types (performance optimization)
  const elementType = element?.type;
  if (!element || !elementType || NON_DRAGGABLE_TYPES.has(elementType)) {
    return children;
  }

  // Check if it's a table (could be 'table' or KEYS.table)
  const tableType = editor?.getType?.(KEYS.table) || 'table';
  if (elementType === tableType) {
    return children;
  }

  const id = element?.id;
  if (!id) {
    return children;
  }

  // Only compute expensive checks for potentially draggable elements
  const isBlock = Boolean(editor?.api?.isBlock?.(element));
  if (!isBlock) {
    return children;
  }

  // Check if inside a list item (memoize the check)
  const liType = editor?.getType?.(KEYS.li) || 'li';
  const isLi = elementType === liType;
  
  // For li elements, check parent type for positioning
  let positionClass = '-left-8';
  if (isLi && path) {
    try {
      const parentNode = editor?.api?.parent?.(path)?.[0];
      if (parentNode?.type === 'ul' || parentNode?.type === 'ol') {
        positionClass = '-left-[3rem]';
      }
    } catch {
      // ignore
    }
  }

  // Check if we're a non-li element inside a list item
  if (!isLi && path) {
    const isInListItem = Boolean(editor?.api?.above?.({ at: path, match: { type: liType } }));
    if (isInListItem) {
      return children; // Don't show drag handle for non-li elements inside list items
    }
  }

  const isDragging = activeDragId === id;

  return (
    <BlockDraggableInner
      id={id}
      element={element}
      path={path}
      isDragging={isDragging}
      dropPosition={dropPosition}
      positionClass={positionClass}
      dragTitle={t('editor.drag')}
    >
      {children}
    </BlockDraggableInner>
  );
});

// Inner component that uses dnd-kit hooks - only rendered for draggable elements
const BlockDraggableInner = memo(({ id, element, path, isDragging, dropPosition, positionClass, dragTitle, children }) => {
  // Skip dnd-kit hooks when DnD is disabled (performance optimization for bulk operations)
  if (dndDisabledRef.current) {
    return <div className="group relative overflow-visible"><div>{children}</div></div>;
  }
  
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: `drag-${id}`,
    data: { element, path, id },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${id}`,
    data: { element, path, id },
  });

  return (
    <div 
      ref={setDropRef}
      className={`group relative overflow-visible ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* Drop indicator - top */}
      {isOver && dropPosition === 'before' && (
        <div className="absolute left-0 right-0 -top-[2px] h-[2px] bg-blue-500 rounded z-20" />
      )}
      
      {/* Drop indicator - bottom */}
      {isOver && dropPosition === 'after' && (
        <div className="absolute left-0 right-0 -bottom-[2px] h-[2px] bg-blue-500 rounded z-20" />
      )}

      {/* drag handle */}
      <DragHandle
        dragRef={setDragRef}
        attributes={attributes}
        listeners={listeners}
        title={dragTitle}
        positionClass={positionClass}
      />

      <div>{children}</div>
    </div>
  );
});

// Editor DnD Provider Component - uses useEditorRef() to get the editor
const EditorDndProvider = ({ children }) => {
  const editor = useEditorRef();
  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event) => {
    const { active } = event;
    if (active?.data?.current) {
      setActiveDragId(active.data.current.id);
      setActiveDragData(active.data.current);
    }
  };

  const handleDragOver = (event) => {
    const { over, active } = event;
    if (!over || !active) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const overId = over.data?.current?.id;
    const activeId = active.data?.current?.id;
    
    if (overId && overId !== activeId) {
      setDropTargetId(overId);
      // Determine position based on cursor position relative to element center
      const overRect = over.rect;
      const activeRect = active.rect?.current?.translated;
      if (overRect && activeRect) {
        const overCenter = overRect.top + overRect.height / 2;
        const activeCenter = activeRect.top + activeRect.height / 2;
        setDropPosition(activeCenter < overCenter ? 'before' : 'after');
      } else {
        setDropPosition('after');
      }
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active && over && editor) {
      const sourceData = active.data?.current;
      const targetData = over.data?.current;
      
      if (sourceData && targetData && sourceData.id !== targetData.id) {
        try {
          // Find nodes by their IDs in the current editor state
          let sourceEntry = null;
          let targetEntry = null;
          
          // Search through all nodes to find by ID
          for (const [node, path] of Editor.nodes(editor, { at: [] })) {
            if (node.id === sourceData.id) sourceEntry = [node, path];
            if (node.id === targetData.id) targetEntry = [node, path];
            if (sourceEntry && targetEntry) break;
          }
          
          if (sourceEntry && targetEntry) {
            const [, sourceCurrentPath] = sourceEntry;
            const [, targetCurrentPath] = targetEntry;
            
            // Calculate destination path
            let destPath;
            if (dropPosition === 'before') {
              destPath = targetCurrentPath;
            } else {
              destPath = [...targetCurrentPath.slice(0, -1), targetCurrentPath[targetCurrentPath.length - 1] + 1];
            }
            
            // Only move if paths are different
            if (JSON.stringify(sourceCurrentPath) !== JSON.stringify(destPath)) {
              Transforms.moveNodes(editor, {
                at: sourceCurrentPath,
                to: destPath,
              });
            }
          }
        } catch (err) {
          console.error('Failed to move block:', err);
        }
      }
    }
    
    // Reset state
    setActiveDragId(null);
    setActiveDragData(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setActiveDragData(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const contextValue = useMemo(() => ({
    activeDragId,
    activeDragData,
    dropTargetId,
    dropPosition,
  }), [activeDragId, activeDragData, dropTargetId, dropPosition]);

  return (
    <EditorDndContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeDragData && (
            <div className="bg-white shadow-lg rounded-md px-4 py-2 border border-gray-200 text-sm text-gray-600 max-w-[300px] truncate">
              <span className="flex items-center gap-2">
                <span className="text-gray-400 select-none">⋮⋮</span>
                {activeDragData.element?.type || 'Block'}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </EditorDndContext.Provider>
  );
};

// Create a proper Plate plugin for dnd-kit block dragging
const dndKitPlugin = createPlatePlugin({
  key: 'dndKit',
  render: {
    aboveNodes: BlockDraggable,
  },
});

// Normalize markdown for Plate.
// - Keep content intact (avoid hidden CRLF edge cases).
// - Backward-compat: older builds replaced thematic breaks (`---`) with a unicode divider `────────`
//   to avoid hr rendering crashes. If such text dividers were saved back to files, convert them back
//   to `---` so the official HorizontalRulePlugin can render them properly.
const sanitizeMarkdownForPlate = (markdown) => {
  return String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      // legacy divider line (box drawing heavy horizontal)
      if (/^\s*─{3,}\s*$/.test(line)) return '---';
      return line;
    })
    .join('\n');
};

// --- Markdown render overrides (HR) ---
// React forbids void elements like <hr> from receiving children. Slate/Plate still needs a text child.
// So we render <hr/> inside a wrapper div, and place Slate children alongside it.
const HrElement = memo(({ attributes, children }) => (
  <div {...attributes} className="my-6 w-full">
    <hr className="w-full border-0 border-t border-gray-200" />
    {children}
  </div>
));

// --- Code Block (official) ---
// Ref: https://platejs.org/docs/code-block
const lowlight = createLowlight(all);

// Use <span> to keep valid structure inside <code>, and make it block for per-line layout.
const CodeLineElement = memo((props) => <PlateElement {...props} as="span" className="block whitespace-pre" />);

const CodeSyntaxLeaf = memo((props) => (
  <span {...props.attributes} className={props.leaf?.className || undefined}>
    {props.children}
  </span>
));

// --- Table (GFM) support via @platejs/table ---
// Reference: https://platejs.org/docs/table#add-kit
const TableElement = memo((props) => (
  <div className="my-4 overflow-x-auto">
    <PlateElement
      {...props}
      as="table"
      className="min-w-full border-collapse text-sm text-gray-700"
    />
  </div>
));

const TableRowElement = memo((props) => (
  <PlateElement
    {...props}
    as="tr"
    className="border-b border-gray-200 last:border-b-0"
  />
));

const TableCellElement = memo((props) => (
  <PlateElement
    {...props}
    as="td"
    className="border border-gray-200 px-3 py-2 align-top"
  />
));

const TableCellHeaderElement = memo((props) => (
  <PlateElement
    {...props}
    as="th"
    className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-900 whitespace-nowrap"
  />
));

const TableKit = [
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
];

const TABLE_NODE_TYPE = KEYS.table || 'table';

// --- Column Layout support via @platejs/layout ---
// Reference: https://platejs.org/docs/column
const ColumnGroupElement = memo((props) => {
  const { attributes, children, element } = props;
  // Count children to calculate column widths
  const columnCount = element?.children?.length || 2;
  const gridStyle = useMemo(() => ({ 
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    gap: '16px',
    width: '100%',
    margin: '16px 0',
    boxSizing: 'border-box',
  }), [columnCount]);
  
  return (
    <div
      {...attributes}
      data-slate-node="element"
      data-column-count={columnCount}
      style={gridStyle}
    >
      {children}
    </div>
  );
});

const columnElementStyle = { 
  padding: '12px',
  border: '1px dashed #d1d5db',
  borderRadius: '6px',
  minHeight: '60px',
  boxSizing: 'border-box',
};

const ColumnElement = memo((props) => {
  const { attributes, children } = props;
  return (
    <div
      {...attributes}
      data-slate-node="element"
      style={columnElementStyle}
    >
      {children}
    </div>
  );
});

const ColumnKit = [
  ColumnPlugin.withComponent(ColumnGroupElement),
  ColumnItemPlugin.withComponent(ColumnElement),
];

const COLUMN_NODE_TYPE = KEYS.column || 'column';

const insertColumnGroup = (editor, opts = { columns: 2 }) => {
  try {
    // Use the official @platejs/layout transform
    insertColumnGroupTransform(editor, { columns: opts.columns || 2 });
    
    // Insert an empty paragraph after the column group so user can continue typing
    // This fixes the issue where users can't add new lines after a column layout at the end
    setTimeout(() => {
      try {
        const { selection } = editor;
        if (selection) {
          // Move to end of the column group and insert a paragraph
          editor.tf.insertNodes(
            { type: KEYS.p || 'p', children: [{ text: '' }] },
            { at: [selection.anchor.path[0] + 1], select: false }
          );
        }
      } catch (e) {
        // Ignore errors - the paragraph insertion is best-effort
      }
    }, 0);
    
    return true;
  } catch (err) {
    console.error('Failed to insert column group:', err);
    return false;
  }
};

const insertTableSafe = (editor, opts = { rowCount: 3, colCount: 3 }) => {
  const fn = editor?.tf?.insert?.table;
  if (typeof fn === 'function') {
    fn(opts);
    return true;
  }
  return false;
};

// --- List Classic render overrides ---
// Show GFM task list checkboxes when list items have `checked` boolean.
const BulletedListElement = memo((props) => (
  <PlateElement {...props} as="ul" className="my-1 pl-5 list-disc" />
));

const NumberedListElement = memo((props) => {
  const start =
    typeof props?.element?.start === 'number'
      ? props.element.start
      : typeof props?.element?.listStart === 'number'
        ? props.element.listStart
        : undefined;
  return (
    <PlateElement
      {...props}
      as="ol"
      // HTML ordered list supports `start` attribute for continuing numbering.
      attributes={{ ...(props.attributes || {}), ...(start ? { start } : {}) }}
      className="my-1 pl-5 list-decimal"
    />
  );
});

const TaskListElement = memo((props) => (
  <PlateElement {...props} as="ul" className="my-1 pl-5 list-none" />
));

const ListItemElement = memo((props) => {
  const editor = useEditorRef();
  const { element } = props;
  const checked = Object.prototype.hasOwnProperty.call(element ?? {}, 'checked')
    ? Boolean(element.checked)
    : undefined;

  const toggleChecked = useCallback(() => {
    try {
      const path = ReactEditor.findPath(editor, element);
      editor.tf.setNodes({ checked: !checked }, { at: path });
    } catch {
      // ignore
    }
  }, [editor, element, checked]);

  // If it's a task list item, render a checkbox (contentEditable=false).
  if (typeof checked === 'boolean') {
    return (
      <PlateElement
        {...props}
        as="li"
        className="flex items-start gap-2 my-1"
      >
        {/* Align checkbox with first line baseline across varying font sizes */}
        <span contentEditable={false} className="-translate-y-[0.06em]">
          <input
            type="checkbox"
            checked={checked}
            onChange={toggleChecked}
            onMouseDown={(e) => e.preventDefault()}
            className="h-4 w-4 rounded border-gray-300 text-gray-800 focus:ring-0"
          />
        </span>
        <div className="min-w-0 flex-1">{props.children}</div>
      </PlateElement>
    );
  }

  return <PlateElement {...props} as="li" className="my-1" />;
});

const getSafeHref = (url) => {
  const s = String(url || '').trim();
  if (!s) return undefined;
  if (s.startsWith('oc://doc/')) return s;
  if (s.startsWith('#') || s.startsWith('/')) return s;
  const m = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  const scheme = (m?.[1] || '').toLowerCase();
  if (['http', 'https', 'mailto', 'tel'].includes(scheme)) return s;
  return undefined;
};

// Ensure internal links render as real <a href="..."> elements (clickable) and remain safe.
const LinkElement = memo((props) => {
  const { attributes, children, element, className } = props;
  const href = getSafeHref(element?.url);
  const isOc = Boolean(href && href.startsWith('oc://doc/'));
  
  const linkClassName = useMemo(() => [
    'cursor-pointer underline underline-offset-2 decoration-gray-300 hover:decoration-gray-500',
    'text-blue-600 hover:text-blue-700',
    className
  ].filter(Boolean).join(' '), [className]);

  const linkAttributes = useMemo(() => ({
    ...attributes,
    href,
    // Only open non-oc links in a new tab by default.
    target: isOc ? undefined : '_blank',
    rel: isOc ? undefined : 'noopener noreferrer'
  }), [attributes, href, isOc]);

  return (
    <PlateElement
      {...props}
      as="a"
      attributes={linkAttributes}
      className={linkClassName}
    >
      {children}
    </PlateElement>
  );
});

const linkPlugin = LinkPlugin.configure({
  options: {
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'oc']
  },
  override: {
    components: {
      [KEYS.link]: LinkElement
    }
  }
});

// Clear block formatting for the current block only (not the entire document).
// IMPORTANT: We must limit the scope to the current selection to avoid
// accidentally converting the entire document to paragraphs.
const clearBlockFormatting = (editor) => {
  const { selection } = editor;
  if (!selection) return;

  // Find the block node at the current selection
  const blockEntry = editor.api.above({
    at: selection,
    match: (n) => editor.api.isBlock(n),
  });
  if (!blockEntry) return;

  const [, blockPath] = blockEntry;

  // Only transform this specific block
  editor.tf.setNodes(
    { type: KEYS.p },
    {
      at: blockPath,
      match: (node) => editor.api.isBlock(node),
    }
  );
  [KEYS.listType, KEYS.listChecked, KEYS.listStart, KEYS.listRestart, KEYS.indent].forEach((key) => {
    editor.tf.unsetNodes(key, {
      at: blockPath,
      match: (node) => editor.api.isBlock(node),
    });
  });
};

// Check if the current selection is inside a code block.
// This prevents autoformat from triggering inside code blocks.
const isInsideCodeBlock = (editor) => {
  const { selection } = editor;
  if (!selection) return false;

  try {
    const codeBlockEntry = editor.api.above({
      at: selection,
      match: (n) => n?.type === 'code_block' || n?.type === KEYS.codeBlock,
    });

    return Boolean(codeBlockEntry);
  } catch {
    return false;
  }
};

// Check if the current selection is inside a list item content (lic).
// This prevents autoformat from triggering on existing list items of the SAME type.
// We allow creating nested lists of different types (e.g., ul inside ol).
//
// @param {Editor} editor - The Plate editor
// @param {string} targetListType - The type of list being created: 'ol', 'ul', or 'taskList'
const isInsideListItemOfSameType = (editor, targetListType) => {
  const { selection } = editor;
  if (!selection) return false;

  try {
    // Get the current block at the selection
    const blockEntry = editor.api.above({
      at: selection,
      match: (n) => editor.api.isBlock(n),
    });

    if (!blockEntry) return false;

    const [block, blockPath] = blockEntry;
    
    // Check if the current block is a list item content (lic)
    if (block?.type !== 'lic') return false;

    // If we're in a lic, check the parent list type
    // Find the parent list (ul, ol, or taskList)
    const listEntry = editor.api.above({
      at: blockPath,
      match: (n) => n?.type === 'ul' || n?.type === 'ol' || n?.type === 'taskList',
    });

    if (!listEntry) return false;

    const [listNode] = listEntry;
    const currentListType = listNode?.type;

    // If trying to create the same type of list, block it (avoid structure corruption)
    // If trying to create a different type, allow it (nested list of different type)
    if (targetListType === 'ol' && currentListType === 'ol') return true;
    if (targetListType === 'ul' && (currentListType === 'ul' || currentListType === 'taskList')) return true;
    if (targetListType === 'taskList' && (currentListType === 'taskList' || currentListType === 'ul')) return true;

    // Different list type - allow autoformat (creates nested list)
    return false;
  } catch {
    return false;
  }
};

const autoformatPlugin = AutoformatPlugin.configure({
  options: {
    rules: [
      { mode: 'block', type: KEYS.h1, match: '# ', preFormat: clearBlockFormatting },
      { mode: 'block', type: KEYS.h2, match: '## ', preFormat: clearBlockFormatting },
      { mode: 'block', type: KEYS.h3, match: '### ', preFormat: clearBlockFormatting },
      { mode: 'block', type: KEYS.h4, match: '#### ', preFormat: clearBlockFormatting },
      { mode: 'block', type: KEYS.h5, match: '##### ', preFormat: clearBlockFormatting },
      { mode: 'block', type: KEYS.h6, match: '###### ', preFormat: clearBlockFormatting },
      // Fast task list triggers (line start): "[] " / "[ ] " / "[x] "
      {
        mode: 'block',
        match: '[] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(false); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '[ ] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(false); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '[x] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(true); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '[X] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(true); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      // GFM task list: "- [ ] " / "- [x] "
      {
        mode: 'block',
        match: '- [ ] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(false); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '- [x] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(true); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '- [X] ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.taskList.toggle(true); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'taskList'),
      },
      {
        mode: 'block',
        match: '- ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.ul.toggle(); },
        // Skip autoformat if already inside a ul/taskList, but allow in ol (creates nested ul)
        query: (editor) => !isInsideListItemOfSameType(editor, 'ul'),
      },
      {
        mode: 'block',
        match: '* ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.ul.toggle(); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'ul'),
      },
      {
        mode: 'block',
        match: '+ ',
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.ul.toggle(); },
        query: (editor) => !isInsideListItemOfSameType(editor, 'ul'),
      },
      {
        mode: 'block',
        match: '\\d+\\. ',
        matchByRegex: true,
        allowSameTypeAbove: true,
        preFormat: clearBlockFormatting,
        format: (editor) => { editor.tf.ol.toggle(); },
        // Skip autoformat if already inside an ol, but allow in ul/taskList (creates nested ol)
        query: (editor) => !isInsideListItemOfSameType(editor, 'ol'),
      },
      // Horizontal rule: convert typed patterns (--- / ___ / —-) into a proper hr block.
      // Ref: https://platejs.org/docs/horizontal-rule
      {
        mode: 'block',
        type: KEYS.hr,
        match: ['---', '—-', '___'],
        format: (editor) => {
          editor.tf.setNodes({ type: KEYS.hr });
          editor.tf.insertNodes({
            type: KEYS.p,
            children: [{ text: '' }],
          });
        },
      },
      { mode: 'block', type: KEYS.blockquote, match: '> ', allowSameTypeAbove: true, preFormat: clearBlockFormatting },
      // Code block autoformat - don't trigger inside existing code blocks
      { 
        mode: 'block', 
        type: KEYS.codeBlock, 
        match: '```', 
        triggerAtBlockStart: true, 
        preFormat: clearBlockFormatting,
        query: (editor) => !isInsideCodeBlock(editor),
      },
      // Mark autoformats - don't trigger inside code blocks
      { mode: 'mark', type: KEYS.bold, match: '**', query: (editor) => !isInsideCodeBlock(editor) },
      { mode: 'mark', type: KEYS.bold, match: '__', query: (editor) => !isInsideCodeBlock(editor) },
      { mode: 'mark', type: KEYS.italic, match: '*', query: (editor) => !isInsideCodeBlock(editor) },
      { mode: 'mark', type: KEYS.italic, match: '_', query: (editor) => !isInsideCodeBlock(editor) },
      { mode: 'mark', type: KEYS.code, match: '`', query: (editor) => !isInsideCodeBlock(editor) },
      { mode: 'mark', type: KEYS.strikethrough, match: '~~', query: (editor) => !isInsideCodeBlock(editor) }
    ]
  }
});

const BASE_PLUGINS = [
  // Ensure block elements have stable `id` fields for DnD.
  NodeIdPlugin.configure({
    options: {
      idKey: 'id',
      normalizeInitialValue: true,
      filterInline: true,
      filterText: true,
      reuseId: false
    }
  }),
  dndKitPlugin,
  BasicBlocksPlugin,
  BasicMarksPlugin,
  // Indent plugin: no extra indentation for lists
  // Ref: https://platejs.org/docs/indent
  IndentPlugin.configure({
    options: {
      offset: 0,
      unit: 'px'
    }
  }),
  // List Classic: https://platejs.org/docs/list-classic
  ListPlugin,
  BulletedListPlugin.withComponent(BulletedListElement),
  NumberedListPlugin.withComponent(NumberedListElement),
  TaskListPlugin.withComponent(TaskListElement),
  ListItemPlugin.withComponent(ListItemElement),
  ListItemContentPlugin,
  autoformatPlugin,
  CodeBlockPlugin.configure({
    node: { component: CodeBlockElement },
    options: { lowlight, defaultLanguage: 'js' },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
  linkPlugin,
  // Official HR plugin wiring (we provide a Notion-like component).
  HorizontalRulePlugin.withComponent(HrElement),
  ...TableKit,
  ...ColumnKit,
  // Ensure there's always an empty paragraph at the end of the document
  // This allows users to add content after block elements like column layouts
  TrailingBlockPlugin.configure({
    options: {
      type: KEYS.p || 'p',
    },
  }),
  markdownPlugin
];

const deserializeMarkdown = (editor, markdown) => {
  const result = editor.getApi(markdownPlugin).markdown.deserialize(sanitizeMarkdownForPlate(markdown));
  
  // Filter out undefined/null nodes recursively to prevent normalizeNode errors
  const filterUndefinedNodes = (nodes) => {
    if (!Array.isArray(nodes)) return nodes;
    return nodes
      .filter(node => node !== undefined && node !== null)
      .map(node => {
        if (typeof node === 'object' && node.children) {
          return {
            ...node,
            children: filterUndefinedNodes(node.children)
          };
        }
        return node;
      });
  };
  
  return filterUndefinedNodes(result);
};

const serializeMarkdown = (editor, value) =>
  editor.getApi(markdownPlugin).markdown.serialize({ value });

export function PlateMarkdownEditor({
  markdown,
  docMeta,
  editorId,
  onChange,
  onOpenDocById,
  readOnly = false,
  onEditIntent,
  className,
  placeholder
}) {
  const editor = usePlateEditor(
    {
      id: editorId,
      plugins: BASE_PLUGINS,
      value: (editor) => deserializeMarkdown(editor, markdown)
    },
    [editorId]
  );


  // Install compat normalizer once per editor instance.
  // Then force a normalize pass to fix ordered-list continuation after initial load.
  useEffect(() => {
    if (!editor) return;
    installListCompatNormalize(editor);
    // Force normalize to fix ordered-list continuation numbering after initial document load.
    // This is needed because the initial value is set before our custom normalizer is installed.
    try {
      Editor.normalize(editor, { force: true });
    } catch {
      // ignore
    }
  }, [editor]);

  const lastSerializedRef = useRef({ id: editorId, value: markdown });
  const [slashTrigger, setSlashTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const [isPageRefOpen, setIsPageRefOpen] = useState(false);
  const [pageRefQuery, setPageRefQuery] = useState('');
  const [pageRefResults, setPageRefResults] = useState([]);
  const [pageRefFolders, setPageRefFolders] = useState([]);
  const [pageRefFolderOpen, setPageRefFolderOpen] = useState(new Set());
  const [pageRefSelectedFolder, setPageRefSelectedFolder] = useState(null);
  const [pageRefFolderDocs, setPageRefFolderDocs] = useState({});
  const [pageRefSelectedIndex, setPageRefSelectedIndex] = useState(0);
  const pageRefListScrollRef = useRef(null);
  const pageRefItemRefs = useRef([]);
  const { t } = useTranslation();

  const showToast = (msg) => {
    if (!msg) return;
    setToast(String(msg));
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  // Refs for debounced onChange serialization
  const serializeTimerRef = useRef(null);
  const pendingSerializeRef = useRef(false);

  /**
   * Serialize editor content and emit onChange if content has changed.
   * Shared by both debounced updates and cleanup flush.
   * @returns {boolean} true if onChange was called
   */
  const flushSerialize = useCallback(() => {
    if (!editor || !onChange) return false;
    
    try {
      const nextMarkdown = serializeMarkdown(editor, editor.children);
      if (lastSerializedRef.current.value === nextMarkdown && lastSerializedRef.current.id === editorId) {
        return false; // No change
      }
      lastSerializedRef.current = { id: editorId, value: nextMarkdown };
      onChange(nextMarkdown);
      return true;
    } catch (e) {
      console.warn('Markdown serialize failed:', e);
      showToast(t('editor.serializeFailed'));
      return false;
    }
  }, [editor, editorId, onChange, showToast, t]);

  // Wire up debounced onChange handling
  useEffect(() => {
    if (!editor || !onChange) return;
    const originalOnChange = editor.onChange;
    
    const scheduleSerialize = () => {
      if (serializeTimerRef.current) clearTimeout(serializeTimerRef.current);
      pendingSerializeRef.current = true;
      serializeTimerRef.current = setTimeout(() => {
        if (!pendingSerializeRef.current) return;
        pendingSerializeRef.current = false;
        flushSerialize();
      }, 150); // 150ms debounce for typing performance
    };
    
    editor.onChange = () => {
      originalOnChange();
      scheduleSerialize();
    };
    
    return () => {
      editor.onChange = originalOnChange;
      if (serializeTimerRef.current) {
        clearTimeout(serializeTimerRef.current);
        serializeTimerRef.current = null;
      }
      // Flush pending changes to prevent data loss on document switch
      if (pendingSerializeRef.current) {
        pendingSerializeRef.current = false;
        flushSerialize();
      }
    };
  }, [editor, onChange, flushSerialize]);

  useEffect(() => {
    if (!editor) return;
    const last = lastSerializedRef.current;
    if (last.value === markdown && last.id === editorId) return;
    editor.tf.reset();
    editor.tf.setValue(deserializeMarkdown(editor, markdown));
    lastSerializedRef.current = { id: editorId, value: markdown };
  }, [editor, editorId, markdown]);

  if (!editor) return null;

  const buildFolderTree = (folders) => {
    const root = { children: {} };
    folders.forEach((folder) => {
      if (!folder?.rel_path) return;
      const parts = folder.rel_path.split('/');
      let current = root;
      parts.forEach((part, index) => {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            children: {}
          };
        }
        current = current.children[part];
      });
    });
    const toArray = (node) =>
      Object.values(node.children)
        .map((child) => ({ ...child, children: toArray(child) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return toArray(root);
  };

  const folderTree = useMemo(() => buildFolderTree(pageRefFolders), [pageRefFolders]);

  const ensurePageRefData = async () => {
    if (pageRefFolders.length) return;
    try {
      const folders = await api.listFolders({ all: true });
      setPageRefFolders(folders || []);
      // 默认展开第一层空间
      const topLevel = (folders || [])
        .map((f) => f.rel_path)
        .filter(Boolean)
        .map((p) => p.split('/')[0]);
      const initialOpen = new Set(topLevel);
      setPageRefFolderOpen(initialOpen);
      // 默认选中当前文档所在 folder（如果有）
      const currentDir = docMeta?.rel_path ? docMeta.rel_path.split('/').slice(0, -1).join('/') : null;
      setPageRefSelectedFolder(currentDir || (topLevel[0] || null));
    } catch (e) {
      showToast(t('pageRef.loadFolderFail'));
    }
  };

  const loadDocsForFolder = async (folderPath) => {
    if (!folderPath) return;
    if (pageRefFolderDocs[folderPath]) return;
    try {
      const docs = await api.listDocs(folderPath, false);
      setPageRefFolderDocs((prev) => ({ ...prev, [folderPath]: docs || [] }));
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!isPageRefOpen) return;
    ensurePageRefData();
  }, [isPageRefOpen]);

  useEffect(() => {
    if (!isPageRefOpen) return;
    if (!pageRefSelectedFolder) return;
    loadDocsForFolder(pageRefSelectedFolder);
  }, [isPageRefOpen, pageRefSelectedFolder]);

  useEffect(() => {
    if (!isPageRefOpen) return;
    const q = String(pageRefQuery || '').trim();
    if (!q) {
      setPageRefResults([]);
      setPageRefSelectedIndex(0);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await api.searchDocs(q, 50);
        if (cancelled) return;
        setPageRefResults(results || []);
        setPageRefSelectedIndex(0);
      } catch (e) {
        if (cancelled) return;
        setPageRefResults([]);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isPageRefOpen, pageRefQuery]);

  // PageRef 右侧列表：键盘上下选择时，自动滚动到可视区
  useEffect(() => {
    if (!isPageRefOpen) return;
    const list = (String(pageRefQuery || '').trim() ? pageRefResults : (pageRefFolderDocs[pageRefSelectedFolder] || [])) || [];
    if (!list.length) return;
    const el = pageRefItemRefs.current?.[pageRefSelectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [isPageRefOpen, pageRefQuery, pageRefResults, pageRefFolderDocs, pageRefSelectedFolder, pageRefSelectedIndex]);

  const insertPageRef = async (doc) => {
    const label = (doc.rel_path || '').split('/').pop()?.replace(/\.md$/i, '') || t('editor.page');
    // Include rel_path as a fallback so the desktop (Tauri) build can still open links
    // even if `get_doc_by_id` is not available.
    const relPath = String(doc?.rel_path || '').trim();
    const fallbackPath = encodeURIComponent(relPath);
    // Compat: some backends may return camelCase.
    let stableId = String(doc?.stable_id || doc?.stableId || '').trim();
    if (!stableId && relPath) {
      try {
        const meta = await api.getDocMeta(relPath);
        stableId = String(meta?.stable_id || meta?.stableId || '').trim();
      } catch (e) {
        // ignore; we still can insert a path-only link
      }
    }
    // Prefer stable_id; if missing, still generate a link that can be opened via fallbackRelPath.
    const url = stableId
      ? (fallbackPath ? `oc://doc/${stableId}?path=${fallbackPath}` : `oc://doc/${stableId}`)
      : (fallbackPath ? `oc://doc/?path=${fallbackPath}` : '');
    if (!url) {
      showToast(t('pageRef.missingId'));
      return;
    }
    try {
      insertLink(editor, { url, text: label });
      editor.tf.insertText(' ');
      setIsPageRefOpen(false);
      setPageRefQuery('');
      setPageRefResults([]);
      showToast(t('pageRef.inserted'));
    } catch (e) {
      showToast(t('pageRef.insertFail'));
    }
  };

  const renderFolderNode = (node, depth = 0) => {
    const isOpen = pageRefFolderOpen.has(node.path);
    const hasChildren = node.children?.length > 0;
    return (
      <div key={node.path}>
        <button
          type="button"
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 ${
            pageRefSelectedFolder === node.path ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => {
            setPageRefSelectedFolder(node.path);
            if (hasChildren) {
              setPageRefFolderOpen((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }
          }}
        >
          <span className="text-gray-400 w-4">{hasChildren ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {hasChildren && isOpen && (
          <div>
            {node.children.map((c) => renderFolderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Use extracted keyboard handler (P2 refactor)
  const handleKeyDown = useMemo(
    () => createEditorKeyDownHandler(editor, {
      onSlashTrigger: () => setSlashTrigger(Date.now()),
    }),
    [editor]
  );

  // Use extracted clipboard handlers for clean copy/paste
  const handleCopy = useMemo(
    () => createCopyHandler(editor, serializeMarkdown),
    [editor]
  );

  const handlePaste = useMemo(
    () => createPasteHandler(editor, deserializeMarkdown, Transforms, {
      onError: () => showToast(t('editor.pasteFailed')),
    }),
    [editor, t, showToast]
  );

  const handleClick = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href) return;

    // In edit mode, never let a plain click navigate away (which looks like a "page refresh").
    // Require Cmd/Ctrl+Click to open external links.
    if (!readOnly && !href.startsWith('oc://doc/')) {
      // Allow in-page anchors.
      if (href.startsWith('#')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey) {
        try {
          window.open(href, '_blank', 'noopener,noreferrer');
        } catch {
          // ignore
        }
      }
      return;
    }

    if (!href.startsWith('oc://doc/')) return;
    event.preventDefault();
    event.stopPropagation();
    let stableId = '';
    let fallbackRelPath = '';
    try {
      const u = new URL(href);
      stableId = String(u.pathname || '').replace(/^\/+/, '').trim();
      fallbackRelPath = decodeURIComponent(u.searchParams.get('path') || '').trim();
    } catch {
      stableId = href.slice('oc://doc/'.length).trim();
      fallbackRelPath = '';
    }
    if (!stableId && !fallbackRelPath) return;
    if (onOpenDocById) onOpenDocById(stableId, { fallbackRelPath });
  };

  // Wrap content in DnD provider for editable mode
  const editorContent = (
    <>
      {!readOnly ? (
        <FloatingToolbar
          docMeta={docMeta}
          onToast={setToast}
          serializeMarkdown={serializeMarkdown}
          markdownPlugin={markdownPlugin}
        />
      ) : null}
      {!readOnly ? <TableFloatingToolbar /> : null}
      {!readOnly ? (
        <SlashMenu
          trigger={slashTrigger}
          onOpenPageRefPicker={() => {
            setIsPageRefOpen(true);
            setPageRefQuery('');
            setPageRefResults([]);
            setPageRefSelectedIndex(0);
          }}
          tableNodeType={TABLE_NODE_TYPE}
          insertTable={insertTableSafe}
          columnNodeType={COLUMN_NODE_TYPE}
          insertColumnGroup={insertColumnGroup}
        />
      ) : null}
      {isPageRefOpen && (
        <div className="fixed inset-0 z-[10001] flex items-start justify-center pt-[12vh] px-4">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
            onMouseDown={() => setIsPageRefOpen(false)}
          />
          <div
            className="relative w-full max-w-[760px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/30 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('pageRef.title')}</span>
              <div className="ml-auto text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">{t('pageRef.esc')}</div>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input
                className="w-full px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                placeholder={t('pageRef.placeholder')}
                value={pageRefQuery}
                onChange={(e) => setPageRefQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsPageRefOpen(false);
                    return;
                  }
                  const list = (pageRefQuery.trim() ? pageRefResults : (pageRefFolderDocs[pageRefSelectedFolder] || [])) || [];
                  if (!list.length) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPageRefSelectedIndex((p) => (p + 1) % list.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPageRefSelectedIndex((p) => (p - 1 + list.length) % list.length);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    insertPageRef(list[pageRefSelectedIndex]);
                  }
                }}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-12 min-h-[380px] max-h-[520px]">
              <div className="col-span-4 border-r border-gray-100 overflow-y-auto p-2 bg-white">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">{t('pageRef.tree')}</div>
                <div className="mt-1">
                  {folderTree.map((n) => renderFolderNode(n, 0))}
                </div>
              </div>

              <div ref={pageRefListScrollRef} className="col-span-8 overflow-y-auto p-2">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                  {pageRefQuery.trim()
                    ? t('pageRef.results')
                    : (pageRefSelectedFolder ? `${t('pageRef.pages')} · ${pageRefSelectedFolder}` : t('pageRef.pages'))}
                </div>
                <div className="mt-1 space-y-1">
                  {((pageRefQuery.trim() ? pageRefResults : (pageRefFolderDocs[pageRefSelectedFolder] || [])) || []).map((doc, idx) => {
                    const docTitle = (doc.rel_path || '').split('/').pop()?.replace(/\.md$/i, '') || doc.name || t('editor.untitled');
                    return (
                      <button
                        key={`${doc.stable_id || doc.rel_path}-${idx}`}
                        ref={(el) => {
                          pageRefItemRefs.current[idx] = el;
                        }}
                        type="button"
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          idx === pageRefSelectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                        onMouseEnter={() => setPageRefSelectedIndex(idx)}
                        onClick={() => insertPageRef(doc)}
                      >
                        <div className="text-sm font-medium text-gray-900 truncate">{docTitle}</div>
                        <div className="text-xs text-gray-500 truncate">{doc.rel_path}</div>
                        {doc.description ? <div className="text-xs text-gray-400 truncate mt-0.5">{doc.description}</div> : null}
                      </button>
                    );
                  })}
                  {((pageRefQuery.trim() ? pageRefResults : (pageRefFolderDocs[pageRefSelectedFolder] || [])) || []).length === 0 && (
                    <div className="px-3 py-6 text-sm text-gray-400">{t('pageRef.empty')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10050] px-4 py-2 rounded-full bg-black/80 text-white text-sm font-medium shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          {toast}
        </div>
      )}
      <PlateContent
        className={className}
        placeholder={placeholder}
        autoFocus
        spellCheck={false}
        readOnly={readOnly}
        onKeyDown={handleKeyDown}
        onMouseDownCapture={() => {
          if (!readOnly) onEditIntent?.();
        }}
        onFocusCapture={() => {
          if (!readOnly) onEditIntent?.();
        }}
        onClick={handleClick}
        onCopy={handleCopy}
        onPaste={handlePaste}
      />
    </>
  );

  return (
    <Plate editor={editor} readOnly={readOnly}>
      {!readOnly ? (
        <EditorDndProvider>{editorContent}</EditorDndProvider>
      ) : (
        editorContent
      )}
    </Plate>
  );
}

export function PlateMarkdownViewer({ markdown, editorId, className, onOpenDocById }) {
  const editor = usePlateEditor(
    {
      id: editorId,
      plugins: BASE_PLUGINS,
      value: (editor) => deserializeMarkdown(editor, markdown)
    },
    [editorId, markdown]
  );
  const contentRef = useRef(null);
  const handleClick = (event) => {
    if (!onOpenDocById) return;
    const target = event?.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('oc://doc/')) return;
    event.preventDefault();
    event.stopPropagation();
    let stableId = '';
    let fallbackRelPath = '';
    try {
      const u = new URL(href);
      stableId = String(u.pathname || '').replace(/^\/+/, '').trim();
      fallbackRelPath = decodeURIComponent(u.searchParams.get('path') || '').trim();
    } catch {
      stableId = href.slice('oc://doc/'.length).trim();
      fallbackRelPath = '';
    }
    if (!stableId && !fallbackRelPath) return;
    onOpenDocById(stableId, { fallbackRelPath });
  };

  useEffect(() => {
    if (!editor || !contentRef.current) return;
    editor.tf.reset();
    editor.tf.setValue(deserializeMarkdown(editor, markdown));
    const headingNodes = contentRef.current.querySelectorAll('h1,h2,h3');
    headingNodes.forEach((node) => {
      const text = node.textContent || '';
      const slug = text.trim().toLowerCase().replace(/[^\w]+/g, '-');
      if (slug) node.id = slug;
      node.classList.add('scroll-mt-24');
    });
  }, [editor, markdown]);

  if (!editor) return null;

  return (
    <Plate editor={editor} readOnly>
      <PlateContent readOnly ref={contentRef} className={className} onClick={handleClick} />
    </Plate>
  );
}
