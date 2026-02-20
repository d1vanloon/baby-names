/**
 * Name data loading and processing module
 */

import { getViewed, markViewed, clearViewed } from './storage.js';

// Years to load (1880-2024)
const YEARS_TO_LOAD = Array.from({ length: 145 }, (_, i) => 1880 + i);

// Minimum occurrences filter
const MIN_OCCURRENCES = 5000;
const FETCH_BATCH_SIZE = 10;

// Cache for loaded names
let allNames = [];
let nameQueue = [];

/**
 * Load and parse name data from CSV files
 * @param {Function} onProgress - Callback with progress percentage (0-100)
 * @returns {Promise<void>}
 */
export async function loadNameData(onProgress) {
    const nameMap = new Map();
    const totalYears = YEARS_TO_LOAD.length;
    let completedYears = 0;

    for (let i = 0; i < YEARS_TO_LOAD.length; i += FETCH_BATCH_SIZE) {
        const years = YEARS_TO_LOAD.slice(i, i + FETCH_BATCH_SIZE);

        const batchMaps = await Promise.all(years.map(async (year) => {
            const yearlyMap = new Map();

            try {
                const response = await fetch(`data/yob${year}.txt`);
                if (!response.ok) {
                    return yearlyMap;
                }

                const text = await response.text();
                const lines = text.trim().split('\n');

                for (const line of lines) {
                    const parts = line.trim().split(',');
                    if (parts.length < 3) continue;

                    const name = parts[0].trim();
                    const count = parseInt(parts[2], 10);
                    const existing = yearlyMap.get(name) || 0;
                    yearlyMap.set(name, existing + count);
                }
            } catch (err) {
                console.warn(`Failed to load data for year ${year}:`, err);
            } finally {
                completedYears += 1;
                if (onProgress) {
                    onProgress(Math.round((completedYears / totalYears) * 100));
                }
            }

            return yearlyMap;
        }));

        for (const yearlyMap of batchMaps) {
            for (const [name, count] of yearlyMap) {
                const existing = nameMap.get(name) || 0;
                nameMap.set(name, existing + count);
            }
        }
    }

    // Filter by minimum occurrences and create array
    allNames = [];
    for (const [name, count] of nameMap) {
        if (count >= MIN_OCCURRENCES) {
            allNames.push(name);
        }
    }

    // Shuffle the names
    shuffleArray(allNames);

    console.log(`Loaded ${allNames.length} names with ${MIN_OCCURRENCES}+ occurrences`);

    // Initialize queue with unviewed names
    resetQueue();
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 * @param {Array} array
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Reset the name queue, filtering out viewed names
 */
export function resetQueue() {
    const viewed = getViewed();
    nameQueue = allNames.filter(name => !viewed.has(name));
    shuffleArray(nameQueue);
}

/**
 * Get the next names to display (for card stack)
 * @param {number} count - Number of names to peek
 * @returns {string[]}
 */
export function peekNextNames(count = 3) {
    return nameQueue.slice(0, count);
}

/**
 * Move a priority name into upcoming cards if needed
 * @param {Iterable<string>} priorityNames
 * @param {number} lookahead
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
        const targetIndex = Math.min(nameQueue.length - 1, 2);

        const name = nameQueue[foundIndex];
        nameQueue.splice(foundIndex, 1);
        nameQueue.splice(targetIndex, 0, name);
    }
}

/**
 * Mark current name as viewed and advance to next
 * @returns {string|null} The name that was consumed
 */
export function consumeCurrentName() {
    if (nameQueue.length === 0) return null;

    const name = nameQueue.shift();
    markViewed(name);
    return name;
}

/**
 * Check if there are more names available
 * @returns {boolean}
 */
export function hasMoreNames() {
    return nameQueue.length > 0;
}

/**
 * Get the total count of available names
 * @returns {number}
 */
export function getRemainingCount() {
    return nameQueue.length;
}

/**
 * Reset all viewed names and reload queue
 */
export function resetAllNames() {
    clearViewed();
    resetQueue();
}

/**
 * Get total names loaded
 * @returns {number}
 */
export function getTotalNamesCount() {
    return allNames.length;
}
