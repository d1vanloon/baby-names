/**
 * Matches view management
 */

import { escapeHtml } from './utils.js';

let matchesListEl = null;
let matchesEmptyEl = null;
let matchesCountEl = null;
let lastMatchesCount = 0;

/**
 * Initialize matches view
 * @param {Object} elements
 */
export function initMatchesView(elements = {}) {
    matchesListEl = elements.matchesList || document.getElementById('matches-list');
    matchesEmptyEl = elements.matchesEmpty || document.getElementById('matches-empty');
    matchesCountEl = elements.matchesCount || document.getElementById('matches-count');

    const initialCount = Number.parseInt(matchesCountEl?.textContent || '0', 10);
    lastMatchesCount = Number.isNaN(initialCount) ? 0 : initialCount;
}

/**
 * Update matches count badge
 * @param {number} count
 */
export function updateMatchesCount(count) {
    if (!matchesCountEl) return;

    const nextCount = Number.isFinite(count) ? count : 0;
    const isIncrement = nextCount > lastMatchesCount;

    if (isIncrement) {
        matchesCountEl.classList.remove('matches-count-pop');
        void matchesCountEl.offsetWidth;
    }

    lastMatchesCount = nextCount;
    matchesCountEl.textContent = String(nextCount);

    if (isIncrement) {
        matchesCountEl.classList.add('matches-count-pop');
        matchesCountEl.addEventListener('animationend', () => {
            matchesCountEl.classList.remove('matches-count-pop');
        }, { once: true });
    }
}

/**
 * Render matches list
 * @param {string[]} matches
 * @param {string} lastName
 */
export function renderMatchesList(matches, lastName) {
    if (!matchesListEl || !matchesEmptyEl) return;

    matchesListEl.innerHTML = '';

    if (!Array.isArray(matches) || matches.length === 0) {
        matchesEmptyEl.classList.remove('hidden');
        matchesListEl.classList.add('hidden');
        return;
    }

    matchesEmptyEl.classList.add('hidden');
    matchesListEl.classList.remove('hidden');

    for (const name of matches) {
        const item = document.createElement('div');
        item.className = 'name-item';
        item.innerHTML = `
            <span class="name-item-text">💕 ${escapeHtml(name)} ${escapeHtml(lastName || '')}</span>
        `;
        matchesListEl.appendChild(item);
    }
}
