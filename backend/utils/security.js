/**
 * Security utility functions
 */

/**
 * Escapes HTML characters to prevent XSS attacks.
 * Replaces <, >, &, ", and ' with their corresponding HTML entities.
 *
 * @param {string} unsafe - The unsafe string to escape
 * @returns {string} The escaped string
 */
const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;

  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

module.exports = {
  escapeHtml
};
