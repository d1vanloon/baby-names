import { describe, it, expect, beforeEach } from 'vitest';

import {
    initMatchesView,
    updateMatchesCount,
    renderMatchesList
} from '../matchesView.js';

describe('matchesView.js', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="matches-list" class="names-list"></div>
            <div id="matches-empty" class="empty-list hidden"></div>
            <span id="matches-count">0</span>
        `;

        initMatchesView();
    });

    it('updates match count badge', () => {
        updateMatchesCount(3);
        expect(document.getElementById('matches-count').textContent).toBe('3');
    });

    it('adds pop class when count increments and removes it on animation end', () => {
        const countEl = document.getElementById('matches-count');

        updateMatchesCount(1);
        expect(countEl.classList.contains('matches-count-pop')).toBe(true);

        countEl.dispatchEvent(new Event('animationend'));
        expect(countEl.classList.contains('matches-count-pop')).toBe(false);
    });

    it('does not add pop class when count stays the same or decreases', () => {
        const countEl = document.getElementById('matches-count');

        updateMatchesCount(1);
        countEl.dispatchEvent(new Event('animationend'));

        updateMatchesCount(1);
        expect(countEl.classList.contains('matches-count-pop')).toBe(false);

        updateMatchesCount(0);
        expect(countEl.classList.contains('matches-count-pop')).toBe(false);
    });

    it('renders empty state when no matches', () => {
        renderMatchesList([], 'Smith');

        expect(document.getElementById('matches-empty').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('matches-list').classList.contains('hidden')).toBe(true);
    });

    it('renders match entries', () => {
        renderMatchesList(['Emma', 'Olivia'], 'Smith');

        const listEl = document.getElementById('matches-list');
        expect(listEl.classList.contains('hidden')).toBe(false);
        expect(listEl.children).toHaveLength(2);
        expect(listEl.textContent).toContain('Emma Smith');
        expect(listEl.textContent).toContain('Olivia Smith');
    });
});
