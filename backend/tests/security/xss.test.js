const { escapeHtml } = require('../../utils/security');

describe('Security Utils - escapeHtml', () => {
  test('should return non-string inputs as is', () => {
    expect(escapeHtml(123)).toBe(123);
    expect(escapeHtml(null)).toBe(null);
    expect(escapeHtml(undefined)).toBe(undefined);
  });

  test('should escape basic HTML characters', () => {
    const input = '<script>alert("xss")</script>';
    const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  test('should escape ampersands', () => {
    const input = 'Tom & Jerry';
    const expected = 'Tom &amp; Jerry';
    expect(escapeHtml(input)).toBe(expected);
  });

  test('should escape single quotes', () => {
    const input = "It's a test";
    const expected = "It&#039;s a test";
    expect(escapeHtml(input)).toBe(expected);
  });

  test('should handle mixed malicious inputs', () => {
    const input = '<img src=x onerror=alert(1) />';
    const expected = '&lt;img src=x onerror=alert(1) /&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });
});
