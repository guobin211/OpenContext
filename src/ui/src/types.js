/**
 * @typedef {Object} Doc
 * @property {string} rel_path
 * @property {string} [abs_path]
 * @property {string} [stable_id]
 * @property {string} [stableId]
 * @property {string} [description]
 * @property {string} [updated_at]
 */

/**
 * @typedef {Object} Folder
 * @property {string} rel_path
 * @property {string} [abs_path]
 * @property {string} [description]
 */

/**
 * @typedef {Object} TocItem
 * @property {number} level
 * @property {string} text
 * @property {string} id
 */

/**
 * @typedef {'CREATE_PAGE'|'CREATE_FOLDER'|'MOVE_DOC'|'MOVE_FOLDER'|'CONFIRM_MOVE_DOC'|'CONFIRM_MOVE_FOLDER'|'RENAME'|'SET_DESCRIPTION'|'DELETE_ITEM'|'ALERT'} DialogKind
 */

/**
 * @typedef {Object} DialogState
 * @property {boolean} isOpen
 * @property {'alert'|'confirm'|'prompt'|'prompt_multiline'} type
 * @property {string} [title]
 * @property {string} [message]
 * @property {string} [placeholder]
 * @property {string} [initialValue]
 * @property {string} [confirmText]
 * @property {string} [cancelText]
 * @property {boolean} [isDestructive]
 * @property {DialogKind} [kind]
 * @property {any} [payload]
 */

export {};


