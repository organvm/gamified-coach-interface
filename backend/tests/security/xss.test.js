const { escapeHtml } = require('../../utils/security');

describe('Security Utilities', () => {
  describe('escapeHtml', () => {
    test('should return input if not a string', () => {
      expect(escapeHtml(123)).toBe(123);
      expect(escapeHtml(null)).toBe(null);
      expect(escapeHtml(undefined)).toBe(undefined);
      expect(escapeHtml({})).toEqual({});
    });

    test('should return original string if no special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });

    test('should escape < and >', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('should escape &', () => {
      expect(escapeHtml('AT&T')).toBe('AT&amp;T');
    });

    test('should escape quotes', () => {
      expect(escapeHtml('hello "world" \'test\'')).toBe('hello &quot;world&quot; &#039;test&#039;');
    });

    test('should handle mixed characters', () => {
      const input = '<div class="test">Bob & Alice\'s code</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;Bob &amp; Alice&#039;s code&lt;/div&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });
  });
});
