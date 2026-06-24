// Security utility functions for sanitization and validation

/**
 * Escapes HTML characters in a string to prevent XSS.
 * Replaces <, >, &, ", and ' with their corresponding HTML entities.
 *
 * @param {string} unsafe - The string to escape
 * @returns {string} The escaped string
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  escapeHtml
};
