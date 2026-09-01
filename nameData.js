/**
 * Name catalog and swipe queue.
 */

import { getViewed, markViewed, clearViewed } from './storage.js';

let allNames = [];
let nameQueue = [];

/**
 * Load the pre-filtered SSA catalog.
 * @param {Function} [onProgress]
 * @returns {Promise<void>}
 */
export async function loadNameData(onProgress) {
    if (onProgress) {
        onProgress(10);
    }
    const response = await fetch('data/names.json');
    if (!response.ok) {
        throw new Error('Failed to load name catalog');
    }
    const names = await response.json();
    if (!Array.isArray(names)) {
        throw new Error('Name catalog is not a list');
    }
    allNames = names.filter((name) => typeof name === 'string');
    shuffleArray(allNames);
    if (onProgress) {
        onProgress(100);
    }
    resetQueue();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function resetQueue() {
    const viewed = getViewed();
    nameQueue = allNames.filter((name) => !viewed.has(name));
    shuffleArray(nameQueue);
}

/**
 * @param {number} [count]
 * @returns {string[]}
 */
export function peekNextNames(count = 3) {
    return nameQueue.slice(0, count);
}

/**
 * @param {Iterable<string>} priorityNames
 * @param {number} [lookahead]
 */
export function insertPriorityNames(priorityNames, lookahead = 3) {
    const prioritySet = new Set(priorityNames || []);
    if (prioritySet.size === 0 || nameQueue.length === 0) {
        return;
    }

    for (let i = 0; i < Math.min(nameQueue.length, lookahead); i++) {
        if (prioritySet.has(nameQueue[i])) {
            return;
        }
    }

    let foundIndex = -1;
    for (let i = lookahead; i < nameQueue.length; i++) {
        if (prioritySet.has(nameQueue[i])) {
            foundIndex = i;
            break;
        }
    }

    if (foundIndex !== -1) {
        const targetIndex = Math.min(nameQueue.length - 1, lookahead - 1);
        const name = nameQueue[foundIndex];
        nameQueue.splice(foundIndex, 1);
        nameQueue.splice(targetIndex, 0, name);
    }
}

/**
 * @returns {string|null}
 */
export function consumeCurrentName() {
    if (nameQueue.length === 0) {
        return null;
    }
    const name = nameQueue.shift();
    markViewed(name);
    return name;
}

export function hasMoreNames() {
    return nameQueue.length > 0;
}

export function getRemainingCount() {
    return nameQueue.length;
}

export function resetAllNames() {
    clearViewed();
    resetQueue();
}

export function getTotalNamesCount() {
    return allNames.length;
}
