import { describe, it, expect } from 'vitest';

import { escapeHtml } from '../utils.js';

describe('escapeHtml', () => {
    it('should be a function', () => {
        expect(typeof escapeHtml).toBe('function');
    });

    it('should return empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('should return unchanged string for plain text', () => {
        expect(escapeHtml('Emma')).toBe('Emma');
        expect(escapeHtml('Olivia')).toBe('Olivia');
    });

    it('should escape HTML entities', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should escape quotes', () => {
        expect(escapeHtml('Say "hello"')).toBe('Say "hello"');
        expect(escapeHtml("It's great")).toBe("It's great");
    });

    it('should escape mixed content', () => {
        expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should handle special characters', () => {
        expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;"\'');
    });
});
