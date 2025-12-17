/**
 * SlashMenu - Slash command menu for inserting blocks.
 *
 * Triggered by typing "/" in the editor. Supports:
 * - Headings (H1, H2, H3)
 * - Lists (bullet, numbered, task)
 * - Tables
 * - Quotes
 * - Code blocks
 * - Page references
 */

import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorRef, useEditorSelection } from 'platejs/react';
import { KEYS } from 'platejs';
import { Range, Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import {
  CodeBracketIcon,
  ListBulletIcon,
  QueueListIcon,
  ChatBubbleBottomCenterTextIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

// Custom 2-column icon
const Columns2Icon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16" />
  </svg>
);

// Custom 3-column icon
const Columns3Icon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M15 4v16" />
  </svg>
);

// Static item definitions - labels/descriptions come from i18n
const SLASH_ITEM_DEFS = [
  { key: 'h1', type: KEYS.h1, icon: <span className="font-bold text-base">H1</span> },
  { key: 'h2', type: KEYS.h2, icon: <span className="font-bold text-sm">H2</span> },
  { key: 'h3', type: KEYS.h3, icon: <span className="font-bold text-xs">H3</span> },
  { key: 'bulletList', type: 'ul', icon: <ListBulletIcon className="w-4 h-4" /> },
  { key: 'numberedList', type: 'ol', icon: <QueueListIcon className="w-4 h-4" /> },
  { key: 'taskList', type: 'taskList', icon: <span className="font-mono text-sm">[ ]</span> },
  { key: 'table', type: '__TABLE__', icon: <TableCellsIcon className="w-4 h-4" /> },
  { key: 'columns2', type: '__COLUMN_2__', icon: <Columns2Icon className="w-4 h-4" />, keywords: ['column', 'col', '列', '分栏', '两列', '2列'] },
  { key: 'columns3', type: '__COLUMN_3__', icon: <Columns3Icon className="w-4 h-4" />, keywords: ['column', 'col', '列', '分栏', '三列', '3列'] },
  { key: 'quote', type: KEYS.blockquote, icon: <ChatBubbleBottomCenterTextIcon className="w-4 h-4" /> },
  { key: 'codeBlock', type: KEYS.codeBlock, icon: <CodeBracketIcon className="w-4 h-4" /> },
  {
    key: 'pageRef',
    type: 'oc_page_ref',
    icon: <span className="font-semibold text-base">@</span>,
    keywords: ['ref', 'reference', 'link', 'page', 'mention', '引用', '页面', '链接', '文档'],
  },
];

/**
 * @param {object} props
 * @param {number} props.trigger - Trigger counter to force re-check for slash
 * @param {Function} props.onOpenPageRefPicker - Callback to open page reference picker
 * @param {string} props.tableNodeType - Node type for tables
 * @param {Function} props.insertTable - Function to insert a table
 * @param {string} props.columnNodeType - Node type for columns
 * @param {Function} props.insertColumnGroup - Function to insert column layout
 */
const SlashMenu = memo(({ trigger, onOpenPageRefPicker, tableNodeType, insertTable, columnNodeType, insertColumnGroup }) => {
  const { t } = useTranslation();
  const editor = useEditorRef();
  const selection = useEditorSelection();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const listRef = useRef(null);
  const itemRefs = useRef([]);

  // Build items with i18n labels
  const SLASH_ITEMS = useMemo(() => {
    return SLASH_ITEM_DEFS.map((def) => ({
      ...def,
      type: def.type === '__TABLE__' ? tableNodeType : def.type,
      label: t(`slashMenu.${def.key}.label`),
      description: t(`slashMenu.${def.key}.description`),
    }));
  }, [t, tableNodeType]);

  // 检测输入 /
  useEffect(() => {
    const checkSlash = () => {
      let currentSelection = editor.selection ?? selection;

      if (!currentSelection) {
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          try {
            currentSelection = ReactEditor.toSlateRange(editor, domSelection.getRangeAt(0), {
              exactMatch: true,
            });
          } catch {
            currentSelection = null;
          }
        }
      }

      if (!currentSelection || !Range.isCollapsed(currentSelection)) {
        setIsOpen(false);
        return;
      }

      try {
        const point = currentSelection.anchor;

        // 获取当前块级元素
        const blockEntry = Editor.above(editor, {
          at: point,
          match: (n) => Editor.isBlock(editor, n),
        });

        const [, blockPath] = blockEntry || [];
        const start = blockPath ? Editor.start(editor, blockPath) : Editor.start(editor, []);
        const beforeRange = { anchor: start, focus: point };
        const textBeforeCursor = Editor.string(editor, beforeRange);

        // 匹配 /xxx 模式（在行首或空格后）
        const match = textBeforeCursor.match(/(^|\s)\/([^\s]*)$/);

        if (match) {
          const search = match[2];
          setFilter(search);
          setIsOpen(true);
          setSelectedIndex(0);

          requestAnimationFrame(() => {
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const domRange = domSelection.getRangeAt(0);
              const rect = domRange.getBoundingClientRect();
              setPosition({
                top: rect.bottom + 8 + window.scrollY,
                left: rect.left + window.scrollX,
              });
            }
          });
        } else {
          setIsOpen(false);
        }
      } catch {
        setIsOpen(false);
      }
    };

    // 使用 requestAnimationFrame 确保在编辑器更新后执行检测
    const rafId = requestAnimationFrame(checkSlash);
    return () => cancelAnimationFrame(rafId);
  }, [editor.children, selection, editor, trigger]);

  const filteredItems = useMemo(() => {
    const f = (filter || '').toLowerCase();
    return SLASH_ITEMS.filter((item) => {
      const label = String(item.label || '').toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';
      return label.includes(f) || desc.includes(f) || keywords.includes(f);
    });
  }, [filter, SLASH_ITEMS]);

  // 键盘控制
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (!filteredItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectItem(filteredItems[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  // 让键盘选中的菜单项始终滚动到可视区内
  useEffect(() => {
    if (!isOpen) return;
    if (!filteredItems.length) return;
    const el = itemRefs.current?.[selectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [isOpen, filteredItems.length, selectedIndex]);

  const selectItem = (item) => {
    if (!item) return;

    // 删除 /xxx (包括可能的前导空格)
    const deleteLength = filter.length + 1; // +1 for the /
    Transforms.delete(editor, {
      distance: deleteLength,
      reverse: true,
      unit: 'character',
    });

    if (item.type === 'oc_page_ref') {
      setIsOpen(false);
      onOpenPageRefPicker?.();
      return;
    }

    // 插入 Block
    if (item.type === 'ul') {
      editor.tf.ul.toggle();
    } else if (item.type === 'ol') {
      editor.tf.ol.toggle();
    } else if (item.type === 'taskList') {
      editor.tf.taskList.toggle(false);
    } else if (item.type === tableNodeType) {
      insertTable?.(editor, { rowCount: 3, colCount: 3 });
    } else if (item.type === '__COLUMN_2__') {
      insertColumnGroup?.(editor, { columns: 2 });
    } else if (item.type === '__COLUMN_3__') {
      insertColumnGroup?.(editor, { columns: 3 });
    } else if (item.type === KEYS.codeBlock) {
      editor.tf.toggleBlock(KEYS.codeBlock);
    } else {
      editor.tf.toggleBlock(item.type);
    }

    setIsOpen(false);
  };

  if (!isOpen || filteredItems.length === 0 || !position) return null;

  return (
    <div
      className="fixed z-[9999] w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
        {t('editor.basicBlocks')}
      </div>
      <div ref={listRef} className="p-1 max-h-72 overflow-y-auto">
        {filteredItems.map((item, index) => (
          <button
            key={item.key}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={`w-full text-left px-2 py-2 flex items-center gap-3 rounded-lg text-sm transition-colors ${
              index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
            }`}
            onClick={() => selectItem(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="w-10 h-10 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-lg shadow-sm">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-400 truncate">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  </div>
  );
});

export default SlashMenu;
