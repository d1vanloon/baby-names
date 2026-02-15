/**
 * Storage module for persisting data to localStorage
 */

const STORAGE_KEYS = {
    LAST_NAME: 'babyNames_lastName',
    LIKES: 'babyNames_likes',
    VIEWED: 'babyNames_viewed',
    PEER_ID: 'babyNames_peerId',
    PARTNER_ID: 'babyNames_partnerId',
    PEER_SERVER_HOST: 'babyNames_peerServerHost',
    PEER_SERVER_PORT: 'babyNames_peerServerPort',
    PENDING_PARTNER_LAST_NAME: 'babyNames_pendingPartnerLastName'
};

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
 * Get stored peer ID
 * @returns {string|null}
 */
export function getPeerId() {
    return localStorage.getItem(STORAGE_KEYS.PEER_ID);
}

/**
 * Save peer ID
 * @param {string} peerId
 */
export function setPeerId(peerId) {
    localStorage.setItem(STORAGE_KEYS.PEER_ID, peerId);
}

/**
 * Get peer server configuration
 * @returns {{host: string, port: number}}
 */
export function getPeerServerConfig() {
    const host = localStorage.getItem(STORAGE_KEYS.PEER_SERVER_HOST);
    const port = localStorage.getItem(STORAGE_KEYS.PEER_SERVER_PORT);
    return {
        host: host || '0.peerjs.com',
        port: port ? parseInt(port, 10) : 443
    };
}

/**
 * Save peer server configuration
 * @param {string} host
 * @param {number} port
 */
export function setPeerServerConfig(host, port) {
    if (host) {
        localStorage.setItem(STORAGE_KEYS.PEER_SERVER_HOST, host);
    }
    if (port) {
        localStorage.setItem(STORAGE_KEYS.PEER_SERVER_PORT, port.toString());
    }
}

/**
 * Get stored partner ID (for reconnection)
 * @returns {string|null}
 */
export function getPartnerId() {
    return localStorage.getItem(STORAGE_KEYS.PARTNER_ID);
}

/**
 * Save partner ID
 * @param {string} partnerId
 */
export function setPartnerId(partnerId) {
    localStorage.setItem(STORAGE_KEYS.PARTNER_ID, partnerId);
}

/**
 * Clear partner ID (on disconnect)
 */
export function clearPartnerId() {
    localStorage.removeItem(STORAGE_KEYS.PARTNER_ID);
}

/**
 * Get pending last name from partner (for joining users)
 * @returns {string|null}
 */
export function getPendingPartnerLastName() {
    return localStorage.getItem(STORAGE_KEYS.PENDING_PARTNER_LAST_NAME);
}

/**
 * Set pending last name from partner
 * @param {string} lastName
 */
export function setPendingPartnerLastName(lastName) {
    localStorage.setItem(STORAGE_KEYS.PENDING_PARTNER_LAST_NAME, lastName);
}

/**
 * Clear pending partner last name
 */
export function clearPendingPartnerLastName() {
    localStorage.removeItem(STORAGE_KEYS.PENDING_PARTNER_LAST_NAME);
}
