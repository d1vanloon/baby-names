/**
 * Peer-to-peer session module using PeerJS
 */

import {
    getLikes,
    getLastName,
    getPeerServerConfig,
    setPeerId,
    getPeerId,
    getPartnerId,
    setPartnerId,
    clearPartnerId,
    setPendingPartnerLastName
} from './storage.js';

let peer = null;
let connection = null;
let partnerLikes = new Set();
let onMatchFound = null;
let onConnectionChange = null;
let onMatchesUpdated = null;
let onStatusChange = null;
let onPartnerInfo = null;
let isHost = false;

// Connection status constants
export const ConnectionStatus = {
    DISCONNECTED: 'disconnected',
    INITIALIZING: 'initializing',
    WAITING: 'waiting',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
};

let currentStatus = ConnectionStatus.DISCONNECTED;

/**
 * Update and broadcast status
 * @param {string} status
 * @param {string} [message]
 */
function setStatus(status, message = '') {
    currentStatus = status;
    if (onStatusChange) {
        onStatusChange(status, message);
    }
}

/**
 * Get current connection status
 * @returns {string}
 */
export function getConnectionStatus() {
    return currentStatus;
}

/**
 * Initialize peer session
 * @param {Object} callbacks
 */
export function initPeerSession(callbacks) {
    onMatchFound = callbacks.onMatchFound;
    onConnectionChange = callbacks.onConnectionChange;
    onMatchesUpdated = callbacks.onMatchesUpdated;
    onStatusChange = callbacks.onStatusChange;
    onPartnerInfo = callbacks.onPartnerInfo;
}

/**
 * Get PeerJS configuration
 * @returns {Object}
 */
function getPeerConfig() {
    const config = getPeerServerConfig();
    return {
        host: config.host,
        port: config.port,
        secure: config.port === 443,
        debug: 0
    };
}

/**
 * Create or get the peer instance
 * @returns {Promise<Peer>}
 */
async function ensurePeer() {
    if (peer && !peer.destroyed) {
        return peer;
    }

    setStatus(ConnectionStatus.INITIALIZING, 'Setting up peer connection...');

    return new Promise((resolve, reject) => {
        const config = getPeerConfig();
        const existingId = getPeerId();

        // Try to use existing ID if available
        peer = existingId
            ? new Peer(existingId, config)
            : new Peer(config);

        peer.on('open', (id) => {
            console.log('Peer connected with ID:', id);
            setPeerId(id);
            setStatus(ConnectionStatus.WAITING, 'Ready for connection');
            resolve(peer);
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            // If ID is taken, create new peer without ID
            if (err.type === 'unavailable-id') {
                peer = new Peer(config);
                peer.on('open', (id) => {
                    setPeerId(id);
                    setStatus(ConnectionStatus.WAITING, 'Ready for connection');
                    resolve(peer);
                });
            } else {
                setStatus(ConnectionStatus.ERROR, err.message || 'Connection error');
                reject(err);
            }
        });

        peer.on('connection', (conn) => {
            handleIncomingConnection(conn);
        });

        peer.on('disconnected', () => {
            console.log('Peer disconnected from server');
            // Try to reconnect to the signaling server
            if (peer && !peer.destroyed) {
                setStatus(ConnectionStatus.RECONNECTING, 'Reconnecting to server...');
                peer.reconnect();
            }
        });
    });
}

/**
 * Try to reconnect to a previously connected partner
 * @returns {Promise<boolean>}
 */
export async function tryReconnect() {
    const partnerId = getPartnerId();
    if (!partnerId) {
        return false;
    }

    try {
        setStatus(ConnectionStatus.RECONNECTING, 'Reconnecting to partner...');
        await connectToPartner(partnerId);
        return true;
    } catch (err) {
        console.error('Failed to reconnect to partner:', err);
        setStatus(ConnectionStatus.WAITING, 'Partner not available');
        return false;
    }
}

/**
 * Check if we have a stored partner to reconnect to
 * @returns {boolean}
 */
export function hasStoredPartner() {
    return !!getPartnerId();
}

/**
 * Generate a shareable session link
 * @returns {Promise<string>}
 */
export async function generateSessionLink() {
    await ensurePeer();
    const url = new URL(window.location.href);
    url.searchParams.set('join', peer.id);
    return url.toString();
}

/**
 * Check if there's a session to join from URL
 * @returns {string|null}
 */
export function getJoinIdFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('join');
}

/**
 * Clear the join parameter from URL
 */
export function clearJoinParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState({}, '', url.toString());
}

/**
 * Connect to a partner's peer
 * @param {string} partnerId
 * @returns {Promise<void>}
 */
export async function connectToPartner(partnerId) {
    if (connection) {
        connection.close();
    }

    // We're joining, not hosting
    isHost = false;

    setStatus(ConnectionStatus.CONNECTING, 'Connecting to partner...');
    await ensurePeer();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            setStatus(ConnectionStatus.ERROR, 'Connection timed out');
            reject(new Error('Connection timed out'));
        }, 15000);

        connection = peer.connect(partnerId, { reliable: true });

        connection.on('open', () => {
            clearTimeout(timeout);
            console.log('Connected to partner:', partnerId);

            // Store partner ID for reconnection
            setPartnerId(partnerId);

            setupConnectionHandlers(connection);

            // Send our likes
            sendLikes();

            setStatus(ConnectionStatus.CONNECTED, 'Connected to partner');
            if (onConnectionChange) {
                onConnectionChange(true);
            }

            resolve();
        });

        connection.on('error', (err) => {
            clearTimeout(timeout);
            console.error('Connection error:', err);
            setStatus(ConnectionStatus.ERROR, err.message || 'Connection failed');
            reject(err);
        });
    });
}

/**
 * Handle incoming connection from partner
 * @param {DataConnection} conn
 */
function handleIncomingConnection(conn) {
    if (connection) {
        connection.close();
    }

    // We're hosting
    isHost = true;
    connection = conn;
    setStatus(ConnectionStatus.CONNECTING, 'Partner connecting...');

    conn.on('open', () => {
        console.log('Partner connected:', conn.peer);

        // Store partner ID for reconnection
        setPartnerId(conn.peer);

        setupConnectionHandlers(conn);

        // Send handshake with our last name
        const lastName = getLastName();
        if (lastName) {
            connection.send({
                type: 'handshake',
                lastName: lastName
            });
        }

        // Send our likes
        sendLikes();

        setStatus(ConnectionStatus.CONNECTED, 'Connected to partner');
        if (onConnectionChange) {
            onConnectionChange(true);
        }
    });
}

/**
 * Set up data handlers for connection
 * @param {DataConnection} conn
 */
function setupConnectionHandlers(conn) {
    conn.on('data', (data) => {
        handleMessage(data);
    });

    conn.on('close', () => {
        console.log('Connection closed');
        partnerLikes.clear();
        connection = null;

        // Don't clear partner ID - we might reconnect
        setStatus(ConnectionStatus.WAITING, 'Partner disconnected');

        if (onConnectionChange) {
            onConnectionChange(false);
        }
        if (onMatchesUpdated) {
            onMatchesUpdated([]);
        }

        // Try to reconnect after a delay
        const partnerId = getPartnerId();
        if (partnerId) {
            setTimeout(() => {
                if (!connection && getPartnerId()) {
                    tryReconnect();
                }
            }, 3000);
        }
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
        setStatus(ConnectionStatus.ERROR, err.message || 'Connection error');
    });
}

/**
 * Handle incoming message
 * @param {Object} data
 */
function handleMessage(data) {
    if (data.type === 'handshake') {
        // Partner is sharing their info (last name)
        if (data.lastName) {
            setPendingPartnerLastName(data.lastName);
            if (onPartnerInfo) {
                onPartnerInfo({ lastName: data.lastName });
            }
        }
    } else if (data.type === 'likes') {
        // Full likes sync
        partnerLikes = new Set(data.likes);
        updateMatches();
    } else if (data.type === 'like') {
        // Single new like
        const name = data.name;
        const wasNew = !partnerLikes.has(name);
        partnerLikes.add(name);

        // Check if this creates a new match
        if (wasNew && getLikes().includes(name) && onMatchFound) {
            onMatchFound(name);
        }

        updateMatches();
    } else if (data.type === 'unlike') {
        // Remove a like
        partnerLikes.delete(data.name);
        updateMatches();
    }
}

/**
 * Send all our likes to partner
 */
function sendLikes() {
    if (!connection || !connection.open) return;

    connection.send({
        type: 'likes',
        likes: getLikes()
    });
}

/**
 * Notify partner of a new like
 * @param {string} name
 */
export function notifyLike(name) {
    if (!connection || !connection.open) return;

    connection.send({
        type: 'like',
        name: name
    });

    // Check if partner already liked this
    if (partnerLikes.has(name) && onMatchFound) {
        onMatchFound(name);
    }
}

/**
 * Notify partner of an unlike
 * @param {string} name
 */
export function notifyUnlike(name) {
    if (!connection || !connection.open) return;

    connection.send({
        type: 'unlike',
        name: name
    });
}

/**
 * Update matches list
 */
function updateMatches() {
    const myLikes = new Set(getLikes());
    const matches = [...myLikes].filter(name => partnerLikes.has(name));

    if (onMatchesUpdated) {
        onMatchesUpdated(matches);
    }
}

/**
 * Get current matches
 * @returns {string[]}
 */
export function getMatches() {
    const myLikes = new Set(getLikes());
    return [...myLikes].filter(name => partnerLikes.has(name));
}

/**
 * Get partner's liked names
 * @returns {Set<string>}
 */
export function getPartnerLikes() {
    return new Set(partnerLikes);
}

/**
 * Check if connected to partner
 * @returns {boolean}
 */
export function isConnected() {
    return connection && connection.open;
}

/**
 * Disconnect from partner (intentional)
 */
export function disconnect() {
    // Clear partner ID to prevent auto-reconnect
    clearPartnerId();

    if (connection) {
        connection.close();
        connection = null;
    }
    partnerLikes.clear();
    isHost = false;

    setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
    if (onConnectionChange) {
        onConnectionChange(false);
    }
    if (onMatchesUpdated) {
        onMatchesUpdated([]);
    }
}

/**
 * Get peer ID
 * @returns {string|null}
 */
export function getCurrentPeerId() {
    return peer ? peer.id : null;
}

/**
 * Initialize peer and attempt auto-reconnect if partner is stored
 * @returns {Promise<void>}
 */
export async function initializeAndReconnect() {
    await ensurePeer();

    // Try to reconnect to stored partner
    if (hasStoredPartner()) {
        await tryReconnect();
    }
}
