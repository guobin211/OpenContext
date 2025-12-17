/**
 * Utility for consistent className construction.
 *
 * ## Why this file exists
 * - Provides a consistent way to combine class names
 * - Handles conditional classes cleanly
 * - Filters out falsy values automatically
 */

/**
 * Combine class names, filtering out falsy values.
 *
 * @param {...(string | boolean | null | undefined)} classes - Class names to combine
 * @returns {string} - Combined class string
 *
 * @example
 * cn('base', isActive && 'active', 'always')
 * // => 'base active always' (if isActive is true)
 * // => 'base always' (if isActive is false)
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Create a conditional class string based on a condition.
 *
 * @param {boolean} condition - The condition to check
 * @param {string} trueClass - Class to use when condition is true
 * @param {string} [falseClass=''] - Class to use when condition is false
 * @returns {string}
 *
 * @example
 * conditionalClass(isOpen, 'rotate-180', '')
 * // => 'rotate-180' when isOpen is true
 * // => '' when isOpen is false
 */
export function conditionalClass(condition, trueClass, falseClass = '') {
  return condition ? trueClass : falseClass;
}

/**
 * Common button style combinations.
 */
export const buttonStyles = {
  base: 'rounded transition-colors',
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  ghost: 'text-gray-600 hover:bg-gray-100',
  danger: 'border-red-200 text-red-600 hover:bg-red-50',
  active: 'bg-blue-50 text-blue-600',
  toolbar: 'p-1 min-w-[24px] h-[26px] flex items-center justify-center',
};

/**
 * Common text style combinations.
 */
export const textStyles = {
  label: 'text-xs font-medium text-gray-500',
  labelActive: 'text-xs font-medium text-blue-600',
  heading: 'font-semibold text-gray-900',
  body: 'text-sm text-gray-700',
  muted: 'text-xs text-gray-400',
};

export default cn;

