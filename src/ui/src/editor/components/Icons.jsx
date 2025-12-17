/**
 * Shared SVG icons for the editor UI.
 *
 * ## Why this file exists
 * - Centralizes icon definitions to avoid duplication
 * - Provides consistent sizing and styling
 * - Makes it easy to swap icons or add new ones
 *
 * ## Naming Convention
 * - Use descriptive names like `CheckIcon`, `CopyIcon`, `ChevronDownIcon`
 * - All icons accept `className` prop for custom styling
 * - Default size is 12x12 or 16x16 depending on use case
 */

/**
 * Checkmark icon (for success states, selected items)
 */
export const CheckIcon = ({ className = '', size = 12 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Copy icon (clipboard)
 */
export const CopyIcon = ({ className = '', size = 12 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

/**
 * Chevron down icon (for dropdowns)
 */
export const ChevronDownIcon = ({ className = '', size = 10 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Sparkle icon (for AI features)
 */
export const SparkleIcon = ({ className = '', size = 14 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    width={size}
    height={size}
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 6.97a.75.75 0 011.06 0 1.5 1.5 0 002.12 0 .75.75 0 011.06 1.06 1.5 1.5 0 000 2.12.75.75 0 01-1.06 1.06 1.5 1.5 0 00-2.12 0 .75.75 0 01-1.06-1.06 1.5 1.5 0 000-2.12.75.75 0 010-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Drag handle icon (six dots)
 */
export const DragHandleIcon = ({ className = '' }) => (
  <span className={`block leading-none text-sm ${className}`}>⋮⋮</span>
);

/**
 * Close/X icon
 */
export const CloseIcon = ({ className = '', size = 16 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/**
 * Search/magnifying glass icon
 */
export const SearchIcon = ({ className = '', size = 16 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

/**
 * Trash/delete icon
 */
export const TrashIcon = ({ className = '', size = 12 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export default {
  CheckIcon,
  CopyIcon,
  ChevronDownIcon,
  SparkleIcon,
  DragHandleIcon,
  CloseIcon,
  SearchIcon,
  TrashIcon,
};

