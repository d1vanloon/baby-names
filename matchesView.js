/**
 * Matches view management
 */

import { escapeHtml } from './utils.js';

let matchesListEl = null;
let matchesEmptyEl = null;
let matchesCountEl = null;

/**
 * Initialize matches view
 * @param {Object} elements
 */
export function initMatchesView(elements = {}) {
    matchesListEl = elements.matchesList || document.getElementById('matches-list');
    matchesEmptyEl = elements.matchesEmpty || document.getElementById('matches-empty');
    matchesCountEl = elements.matchesCount || document.getElementById('matches-count');
}

/**
 * Update matches count badge
 * @param {number} count
 */
export function updateMatchesCount(count) {
    if (!matchesCountEl) return;
    matchesCountEl.textContent = count;
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
