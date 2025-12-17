/**
 * Clipboard utilities for cross-platform compatibility.
 * 
 * In Tauri environment, uses the native clipboard plugin.
 * In browser environment, uses the Clipboard API with fallbacks.
 */

// Check if we're in Tauri environment
const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

/**
 * Get the Tauri clipboard plugin dynamically
 */
async function getTauriClipboard() {
  if (!isTauri()) return null;
  try {
    // Dynamic import to avoid errors in non-Tauri environments
    const { writeText, readText } = await import('@tauri-apps/plugin-clipboard-manager');
    return { writeText, readText };
  } catch {
    return null;
  }
}

/**
 * Write text to the clipboard with multiple fallback strategies.
 * 
 * Strategy order:
 * 1. Tauri native clipboard (in Tauri environment)
 * 2. Clipboard API with ClipboardItem (works in async context)
 * 3. Clipboard API writeText
 * 4. Legacy execCommand (fallback)
 * 
 * @param {string} text - The text to write to clipboard
 * @returns {Promise<void>}
 * @throws {Error} - If all methods fail
 */
export async function writeClipboardText(text) {
  // Strategy 1: Try Tauri native clipboard
  const tauriClipboard = await getTauriClipboard();
  if (tauriClipboard) {
    try {
      await tauriClipboard.writeText(text);
      return;
    } catch (err) {
      console.warn('Tauri clipboard failed:', err);
      // Fall through to other strategies
    }
  }

  // Strategy 2: Try ClipboardItem API (works in async context in modern browsers)
  if (navigator?.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const clipboardItem = new ClipboardItem({ 'text/plain': blob });
      await navigator.clipboard.write([clipboardItem]);
      return;
    } catch {
      // ClipboardItem failed, try next strategy
    }
  }

  // Strategy 3: Try navigator.clipboard.writeText
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API failed, try next strategy
    }
  }

  // Strategy 4: Fallback using legacy execCommand
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        resolve();
      } else {
        reject(new Error('execCommand copy failed'));
      }
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
}

/**
 * Read text from the clipboard.
 * 
 * @returns {Promise<string>} - The text from clipboard
 */
export async function readClipboardText() {
  // Try Tauri native clipboard first
  const tauriClipboard = await getTauriClipboard();
  if (tauriClipboard) {
    try {
      return await tauriClipboard.readText();
    } catch {
      // Fall through to browser API
    }
  }

  if (navigator?.clipboard?.readText) {
    return await navigator.clipboard.readText();
  }
  throw new Error('Clipboard read not supported in this environment');
}

export default { writeClipboardText, readClipboardText };

