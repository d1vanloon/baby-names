/**
 * Storage module for persisting data to localStorage
 */

const STORAGE_KEYS = {
    LAST_NAME: 'babyNames_lastName',
    LIKES: 'babyNames_likes',
    VIEWED: 'babyNames_viewed',
    PAIRING_TOKEN: 'babyNames_pairingToken',
    SESSION_INSTANCE_ID: 'babyNames_instanceId',
    PARTNER_LIKES: 'babyNames_partnerLikes'
};

function generateUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Get the stored last name
 * @returns {string|null}
 */
export function getLastName() {
    return localStorage.getItem(STORAGE_KEYS.LAST_NAME);
}

/**
 * Save the last name
 * @param {string} lastName
 */
export function setLastName(lastName) {
    localStorage.setItem(STORAGE_KEYS.LAST_NAME, lastName.trim());
}

/**
 * Get the list of liked names
 * @returns {string[]}
 */
export function getLikes() {
    const data = localStorage.getItem(STORAGE_KEYS.LIKES);
    return data ? JSON.parse(data) : [];
}

/**
 * Add a name to likes
 * @param {string} name
 */
export function addLike(name) {
    const likes = getLikes();
    if (!likes.includes(name)) {
        likes.push(name);
        localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(likes));
    }
}

/**
 * Remove a name from likes
 * @param {string} name
 */
export function removeLike(name) {
    const likes = getLikes().filter(n => n !== name);
    localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(likes));
}

/**
 * Clear all likes
 */
export function clearLikes() {
    localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify([]));
}

/**
 * Get the set of viewed names
 * @returns {Set<string>}
 */
export function getViewed() {
    const data = localStorage.getItem(STORAGE_KEYS.VIEWED);
    return data ? new Set(JSON.parse(data)) : new Set();
}

/**
 * Mark a name as viewed
 * @param {string} name
 */
export function markViewed(name) {
    const viewed = getViewed();
    viewed.add(name);
    localStorage.setItem(STORAGE_KEYS.VIEWED, JSON.stringify([...viewed]));
}

/**
 * Clear all viewed names
 */
export function clearViewed() {
    localStorage.setItem(STORAGE_KEYS.VIEWED, JSON.stringify([]));
}

/**
 * Opaque pairing resume blob (host key, region, occupancy).
 * @returns {string|null}
 */
export function getPairingToken() {
    return localStorage.getItem(STORAGE_KEYS.PAIRING_TOKEN);
}

/**
 * @param {string} value
 */
export function setPairingToken(value) {
    localStorage.setItem(STORAGE_KEYS.PAIRING_TOKEN, value);
}

/**
 * Forget the stored pairing resume record.
 */
export function clearPairingToken() {
    localStorage.removeItem(STORAGE_KEYS.PAIRING_TOKEN);
}

/**
 * Get stored partner likes
 * @returns {Set<string>}
 */
export function getPartnerLikes() {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_LIKES);
    return data ? new Set(JSON.parse(data)) : new Set();
}

/**
 * Save partner likes
 * @param {string[]} likes
 */
export function setPartnerLikes(likes) {
    localStorage.setItem(STORAGE_KEYS.PARTNER_LIKES, JSON.stringify(likes));
}

/**
 * Clear stored partner likes
 */
export function clearPartnerLikes() {
    localStorage.setItem(STORAGE_KEYS.PARTNER_LIKES, JSON.stringify([]));
}

/**
 * Get or create the instance ID for this device/browser
 * @returns {string}
 */
export function getInstanceId() {
    let instanceId = localStorage.getItem(STORAGE_KEYS.SESSION_INSTANCE_ID);
    if (!instanceId) {
        instanceId = generateUuid();
        localStorage.setItem(STORAGE_KEYS.SESSION_INSTANCE_ID, instanceId);
    }
    return instanceId;
}
