/**
 * Likes manager module
 */

import { getLikes, removeLike as removeFromStorage, getLastName } from './storage.js';

let likesListEl = null;
let likesEmptyEl = null;
let likesCountEl = null;
let onLikesChanged = null;

/**
 * Initialize likes manager
 * @param {Object} elements
 * @param {Function} onChange - Callback when likes change
 */
export function initLikesManager(elements, onChange) {
    likesListEl = elements.likesList;
    likesEmptyEl = elements.likesEmpty;
    likesCountEl = elements.likesCount;
    onLikesChanged = onChange;
}

/**
 * Render the likes list
 */
export function renderLikesList() {
    const likes = getLikes();
    const lastName = getLastName() || '';

    likesListEl.innerHTML = '';

    if (likes.length === 0) {
        likesEmptyEl.classList.remove('hidden');
        likesListEl.classList.add('hidden');
    } else {
        likesEmptyEl.classList.add('hidden');
        likesListEl.classList.remove('hidden');

        // Show newest first
        const reversed = [...likes].reverse();

        for (const name of reversed) {
            const item = createLikeItem(name, lastName);
            likesListEl.appendChild(item);
        }
    }

    updateLikesCount();
}

/**
 * Create a like item element
 * @param {string} firstName
 * @param {string} lastName
 * @returns {HTMLElement}
 */
function createLikeItem(firstName, lastName) {
    const item = document.createElement('div');
    item.className = 'name-item';
    item.innerHTML = `
        <span class="name-item-text">${escapeHtml(firstName)} ${escapeHtml(lastName)}</span>
        <button class="name-item-delete" title="Remove" data-name="${escapeHtml(firstName)}">🗑️</button>
    `;

    const deleteBtn = item.querySelector('.name-item-delete');
    deleteBtn.addEventListener('click', () => {
        removeLike(firstName);
    });

    return item;
}

/**
 * Remove a like
 * @param {string} name
 */
function removeLike(name) {
    removeFromStorage(name);
    renderLikesList();
    if (onLikesChanged) {
        onLikesChanged();
    }
}

/**
 * Update the likes count badge
 */
export function updateLikesCount() {
    if (likesCountEl) {
        const count = getLikes().length;
        likesCountEl.textContent = count;
        likesCountEl.style.display = count > 0 ? '' : 'none';
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
