const { escapeHtml } = require('../../utils/security');

describe('Security Utils - escapeHtml', () => {
  test('should return input if not a string', () => {
    expect(escapeHtml(123)).toBe(123);
    expect(escapeHtml(null)).toBe(null);
    expect(escapeHtml(undefined)).toBe(undefined);
  });

  test('should escape HTML characters', () => {
    const input = '<script>alert("xss")</script>';
    const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  test('should escape simple text with special chars', () => {
    const input = 'Me & You "forever"';
    const expected = 'Me &amp; You &quot;forever&quot;';
    expect(escapeHtml(input)).toBe(expected);
  });
});
