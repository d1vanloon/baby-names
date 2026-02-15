/**
 * Peer-to-peer session module using PeerJS
 */

import {
    getLikes,
    getPeerServerConfig,
    setPeerId,
    getPeerId,
    getPartnerId,
    setPartnerId,
    clearPartnerId
} from './storage.js';

let peer = null;
let connection = null;
let partnerLikes = new Set();
let onMatchFound = null;
let onConnectionChange = null;
let onMatchesUpdated = null;
let onStatusChange = null;

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

const RECONNECT_CONFIG = {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    jitter: 0.5
};

const ERROR_GUIDANCE = {
    'network': 'Cannot reach signaling server - check internet connection',
    'peer-unavailable': 'Partner is offline or their link expired',
    'disconnected': 'Lost connection to signaling server',
    'unavailable-id': 'Your session expired - getting new one',
    'browser-incompatible': 'Browser lacks required WebRTC features',
    'ssl-unavailable': 'Secure connection not supported by server',
    'peer-error': 'WebRTC connection failed - NAT or firewall blocking'
};

let reconnectAttempt = 0;
let reconnectTimer = null;

/**
 * Log detailed error information
 * @param {Error} err - PeerJS error object
 * @param {string} context - Context description
 */
function logError(err, context) {
    const { type, message } = err;
    const guidance = ERROR_GUIDANCE[type] || 'Unknown error type';
    
    console.error('[PeerJS Error]', {
        context,
        errorType: type,
        message,
        guidance,
        peerId: peer ? peer.id : null,
        partnerId: getPartnerId(),
        timestamp: new Date().toISOString()
    });
    
    if (guidance) {
        console.error(`[PeerJS] Hint: ${guidance}`);
    }
}

/**
 * Get user-friendly error message for display
 * @param {Error} err - PeerJS error object
 * @returns {string} User-friendly message
 */
function getErrorMessage(err) {
    const { type, message } = err;
    const guidance = ERROR_GUIDANCE[type];
    if (guidance) {
        return guidance;
    }
    return message || 'Connection error';
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt) {
    const exponentialDelay = RECONNECT_CONFIG.baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * RECONNECT_CONFIG.jitter * Math.random();
    const delay = Math.min(exponentialDelay + jitter, RECONNECT_CONFIG.maxDelay);
    return Math.floor(delay);
}

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
            logError(err, 'Peer initialization');
            
            if (err.type === 'unavailable-id') {
                console.log('[PeerJS] Retrying with new peer ID...');
                peer = new Peer(config);
                peer.on('open', (id) => {
                    setPeerId(id);
                    setStatus(ConnectionStatus.WAITING, 'Ready for connection');
                    resolve(peer);
                });
            } else {
                setStatus(ConnectionStatus.ERROR, getErrorMessage(err));
                reject(err);
            }
        });

        peer.on('connection', (conn) => {
            handleIncomingConnection(conn);
        });

        peer.on('disconnected', () => {
            console.log('[PeerJS] Disconnected from signaling server', {
                peerId: peer ? peer.id : null,
                timestamp: new Date().toISOString()
            });
            // Try to reconnect to the signaling server
            if (peer && !peer.destroyed) {
                setStatus(ConnectionStatus.RECONNECTING, 'Reconnecting to server...');
                peer.reconnect();
            }
        });
    });
}

/**
 * Clear any pending reconnect timer
 */
function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

/**
 * Attempt a single reconnection
 * @returns {Promise<boolean>}
 */
async function attemptReconnect() {
    const partnerId = getPartnerId();
    if (!partnerId) {
        return false;
    }

    try {
        await connectToPartner(partnerId);
        return true;
    } catch (err) {
        logError(err, 'Reconnect attempt');
        return false;
    }
}

/**
 * Start reconnection attempts with exponential backoff
 * @returns {Promise<boolean>}
 */
export async function startReconnecting() {
    const partnerId = getPartnerId();
    if (!partnerId) {
        return false;
    }

    clearReconnectTimer();
    reconnectAttempt = 0;

    return new Promise((resolve) => {
        const tryOnce = async () => {
            reconnectAttempt++;
            const attemptNum = reconnectAttempt;
            setStatus(
                ConnectionStatus.RECONNECTING,
                `Retrying connection... (${attemptNum}/${RECONNECT_CONFIG.maxAttempts})`
            );

            const success = await attemptReconnect();

            if (success) {
                clearReconnectTimer();
                reconnectAttempt = 0;
                resolve(true);
                return;
            }

            if (reconnectAttempt >= RECONNECT_CONFIG.maxAttempts) {
                clearReconnectTimer();
                reconnectAttempt = 0;
                setStatus(ConnectionStatus.WAITING, 'Partner unavailable');
                resolve(false);
                return;
            }

            const delay = calculateBackoffDelay(reconnectAttempt);
            console.log(`Reconnect attempt ${attemptNum} failed. Retrying in ${Math.round(delay / 1000)}s...`);
            reconnectTimer = setTimeout(tryOnce, delay);
        };

        tryOnce();
    });
}

/**
 * Try to reconnect to a previously connected partner (single attempt)
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
 * Manually trigger reconnection with retry policy
 * @returns {Promise<boolean>}
 */
export async function retryConnection() {
    return startReconnecting();
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
            console.log('[PeerJS] Connection established', {
                localPeer: peer.id,
                remotePeer: partnerId,
                connectionId: connection.connectionId,
                reliable: connection.reliable,
                timestamp: new Date().toISOString()
            });

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
            logError(err, 'Connection (outgoing)');
            setStatus(ConnectionStatus.ERROR, getErrorMessage(err));
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

    connection = conn;
    setStatus(ConnectionStatus.CONNECTING, 'Partner connecting...');

    conn.on('open', () => {
        console.log('[PeerJS] Incoming connection accepted', {
            localPeer: peer ? peer.id : null,
            remotePeer: conn.peer,
            connectionId: conn.connectionId,
            reliable: conn.reliable,
            timestamp: new Date().toISOString()
        });

        // Store partner ID for reconnection
        setPartnerId(conn.peer);

        setupConnectionHandlers(conn);

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
        console.log('[PeerJS] Connection closed', {
            remotePeer: conn.peer,
            wasConnected: conn.open,
            timestamp: new Date().toISOString()
        });
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

        // Try to reconnect after a delay using exponential backoff
        const partnerId = getPartnerId();
        if (partnerId) {
            console.log('[PeerJS] Scheduling reconnect attempt...');
            clearReconnectTimer();
            reconnectTimer = setTimeout(() => {
                if (!connection && getPartnerId()) {
                    startReconnecting();
                }
            }, 3000);
        }
    });

    conn.on('error', (err) => {
        logError(err, 'Connection (incoming)');
        setStatus(ConnectionStatus.ERROR, getErrorMessage(err));
    });
}

/**
 * Handle incoming message
 * @param {Object} data
 */
function handleMessage(data) {
    if (data.type === 'likes') {
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
    clearReconnectTimer();
    reconnectAttempt = 0;

    if (connection) {
        connection.close();
        connection = null;
    }
    partnerLikes.clear();

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

    // Try to reconnect to stored partner with retry policy
    if (hasStoredPartner()) {
        await startReconnecting();
    }
}
