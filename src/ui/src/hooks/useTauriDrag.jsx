/**
 * Tauri Window Drag Hook
 * 
 * 提供窗口拖拽功能，仅在 Tauri 环境中生效。
 * 使用方式：
 * 
 * const { dragProps, DragRegion } = useTauriDrag();
 * 
 * // 方式1：给任意元素添加拖拽能力
 * <div {...dragProps}>可拖拽区域</div>
 * 
 * // 方式2：使用透明拖拽层
 * <DragRegion className="absolute top-0 left-0 right-0 h-8" />
 */

import { useEffect, useRef, useCallback } from 'react';

// 缓存 Tauri window 实例
let tauriWindowInstance = null;
let initPromise = null;

// 初始化 Tauri window（只执行一次）
const initTauriWindow = async () => {
  if (tauriWindowInstance) return tauriWindowInstance;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      tauriWindowInstance = getCurrentWindow();
      return tauriWindowInstance;
    } catch {
      // 非 Tauri 环境
      return null;
    }
  })();
  
  return initPromise;
};

// 立即开始初始化
initTauriWindow();

/**
 * 窗口拖拽 Hook
 */
export function useTauriDrag() {
  const windowRef = useRef(null);
  
  useEffect(() => {
    initTauriWindow().then((win) => {
      windowRef.current = win;
    });
  }, []);
  
  const handleDragStart = useCallback((e) => {
    const win = windowRef.current;
    if (!win) return;
    
    // 只响应左键
    if (e.button !== 0) return;
    
    // 阻止默认行为（如文本选择）
    e.preventDefault();
    
    // 开始拖拽
    win.startDragging();
  }, []);
  
  // 返回可以直接展开到元素上的 props
  const dragProps = {
    onMouseDown: handleDragStart,
    style: { cursor: 'default' },
  };
  
  // 透明拖拽层组件
  const DragRegion = useCallback(({ className = '', style = {} }) => (
    <div
      className={className}
      style={{ ...style, cursor: 'default' }}
      onMouseDown={handleDragStart}
    />
  ), [handleDragStart]);
  
  return {
    dragProps,
    DragRegion,
    startDrag: handleDragStart,
  };
}

export default useTauriDrag;

