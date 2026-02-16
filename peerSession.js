/**
 * Session module using ntfy.sh for pub/sub messaging
 */

import {
    getLikes,
    getSessionTopic,
    setSessionTopic,
    clearSessionTopic,
    getInstanceId
} from './storage.js';

const NTFY_HOST = 'ntfy.sh';

let socket = null;
let currentTopic = null;
let spouseLikes = new Set();
let onMatchFound = null;
let onConnectionChange = null;
let onMatchesUpdated = null;
let onStatusChange = null;
let hasSpouseJoined = false;

let reconnectAttempt = 0;
let reconnectTimer = null;
let isReconnecting = false;
let connectPromise = null;
let sessionGeneration = 0;
const instanceId = getInstanceId();

const RECONNECT_CONFIG = {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    jitter: 0.5
};

export const ConnectionStatus = {
    DISCONNECTED: 'disconnected',
    IN_ROOM: 'in_room',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
};

let currentStatus = ConnectionStatus.DISCONNECTED;

const ERROR_GUIDANCE = {
    'network': 'Cannot reach ntfy server - check internet connection',
    'websocket': 'WebSocket connection failed',
    'not_found': 'Room not found or expired',
    'timeout': 'Connection timed out'
};

function generateTopic() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let topic = '';
    for (let i = 0; i < 8; i++) {
        topic += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return topic;
}

function logError(err, context) {
    console.error('[ntfy Session Error]', {
        context,
        error: err.message || err,
        topic: currentTopic,
        timestamp: new Date().toISOString()
    });
}

function getErrorMessage(err) {
    return ERROR_GUIDANCE[err.type] || err.message || 'Connection error';
}

function calculateBackoffDelay(attempt) {
    const exponentialDelay = RECONNECT_CONFIG.baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * RECONNECT_CONFIG.jitter * Math.random();
    const delay = Math.min(exponentialDelay + jitter, RECONNECT_CONFIG.maxDelay);
    return Math.floor(delay);
}

function setStatus(status, message = '') {
    currentStatus = status;
    if (onStatusChange) {
        onStatusChange(status, message);
    }
}

function nextSessionGeneration() {
    sessionGeneration += 1;
    return sessionGeneration;
}

export function getConnectionStatus() {
    return currentStatus;
}

export function initPeerSession(callbacks) {
    onMatchFound = callbacks.onMatchFound;
    onConnectionChange = callbacks.onConnectionChange;
    onMatchesUpdated = callbacks.onMatchesUpdated;
    onStatusChange = callbacks.onStatusChange;
}

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function connectWebSocket(topic) {
    if (!topic) {
        return Promise.reject(new Error('Room code is required'));
    }

    setStatus(ConnectionStatus.CONNECTING, 'Connecting...');

    if (socket && socket.readyState === WebSocket.OPEN && currentTopic === topic) {
        if (hasSpouseJoined) {
            setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse');
        } else {
            setStatus(ConnectionStatus.IN_ROOM, 'Ready to connect, waiting for spouse...');
        }
        return Promise.resolve(socket);
    }

    if (connectPromise && currentTopic === topic) {
        return connectPromise;
    }

    const generation = sessionGeneration;

    if (socket) {
        socket.close();
        socket = null;
    }

    currentTopic = topic;

    connectPromise = new Promise((resolve, reject) => {
        let settled = false;
        const wsUrl = `wss://${NTFY_HOST}/${topic}/ws`;
        const ws = new WebSocket(wsUrl);
        socket = ws;

        const timeout = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;
            ws.close();
            reject(new Error('Connection timeout'));
        }, 15000);

        ws.onopen = () => {
            if (settled) {
                return;
            }

            if (generation !== sessionGeneration) {
                settled = true;
                clearTimeout(timeout);
                ws.close();
                reject(new Error('Session superseded'));
                return;
            }

            clearTimeout(timeout);
            console.log('[ntfy] WebSocket connected to topic:', topic);

            if (hasSpouseJoined) {
                setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse');
            } else {
                setStatus(ConnectionStatus.IN_ROOM, 'Ready to connect, waiting for spouse...');
            }

            settled = true;
            resolve(ws);
        };

        ws.onmessage = (event) => {
            if (generation !== sessionGeneration) {
                return;
            }

            try {
                const data = JSON.parse(event.data);
                if (data.event === 'message' && data.topic === topic) {
                    const message = JSON.parse(data.message);
                    handleMessage(message);
                }
            } catch (err) {
                console.warn('[ntfy] Failed to parse message:', err);
            }
        };

        ws.onerror = (err) => {
            if (settled || generation !== sessionGeneration) {
                return;
            }

            clearTimeout(timeout);
            logError(err, 'WebSocket error');
            settled = true;
            reject(err);
        };

        ws.onclose = (event) => {
            clearTimeout(timeout);

            if (generation !== sessionGeneration) {
                return;
            }

            console.log('[ntfy] WebSocket closed', {
                code: event.code,
                reason: event.reason,
                topic: currentTopic
            });

            if (socket === ws) {
                socket = null;
            }

            connectPromise = null;

            if (currentTopic) {
                const wasSpouseConnected = hasSpouseJoined;
                hasSpouseJoined = false;
                if (wasSpouseConnected && onConnectionChange) {
                    onConnectionChange(false);
                }
                setStatus(ConnectionStatus.CONNECTING, 'Reconnecting...');
                scheduleReconnect();
            } else {
                setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
            }
        };
    }).finally(() => {
        if (generation === sessionGeneration) {
            connectPromise = null;
        }
    });

    return connectPromise;
}

function scheduleReconnect() {
    if (!getSessionTopic() || isReconnecting) {
        return;
    }

    clearReconnectTimer();
    isReconnecting = true;
    reconnectAttempt = 0;
    const generation = sessionGeneration;

    const tryConnect = () => {
        if (generation !== sessionGeneration) {
            isReconnecting = false;
            return;
        }

        if (!getSessionTopic()) {
            isReconnecting = false;
            return;
        }

        reconnectAttempt++;
        setStatus(
            ConnectionStatus.CONNECTING,
            `Reconnecting... (${reconnectAttempt}/${RECONNECT_CONFIG.maxAttempts})`
        );

        connectWebSocket(getSessionTopic())
            .then(() => {
                isReconnecting = false;
                reconnectAttempt = 0;
                sendLikes();
            })
            .catch((err) => {
                logError(err, 'Reconnect attempt');
                if (reconnectAttempt >= RECONNECT_CONFIG.maxAttempts) {
                    isReconnecting = false;
                    reconnectAttempt = 0;
                    setStatus(ConnectionStatus.IN_ROOM, 'Spouse unavailable');
                    return;
                }

                const delay = calculateBackoffDelay(reconnectAttempt);
                console.log(`Reconnect attempt ${reconnectAttempt} failed. Retrying in ${Math.round(delay / 1000)}s...`);
                reconnectTimer = setTimeout(tryConnect, delay);
            });
    };

    reconnectTimer = setTimeout(tryConnect, 1000);
}

async function publishMessage(data) {
    if (!currentTopic) {
        console.warn('[ntfy] No topic set, cannot publish');
        return;
    }

    const url = `https://${NTFY_HOST}/${currentTopic}`;
    const body = JSON.stringify({
        ...data,
        senderId: instanceId
    });

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Cache': 'no'
            },
            body: body
        });
    } catch (err) {
        console.error('[ntfy] Failed to publish message:', err);
    }
}

function handleMessage(data) {
    if (data.senderId === instanceId) {
        return;
    }

    if (!hasSpouseJoined) {
        hasSpouseJoined = true;
        setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse');
        if (onConnectionChange) {
            onConnectionChange(true);
        }
    }

    if (data.type === 'likes') {
        spouseLikes = new Set(data.likes);
        updateMatches();
        sendLikes();
    } else if (data.type === 'like') {
        const name = data.name;
        const wasNew = !spouseLikes.has(name);
        spouseLikes.add(name);

        if (wasNew && getLikes().includes(name) && onMatchFound) {
            onMatchFound(name);
        }

        updateMatches();
    } else if (data.type === 'unlike') {
        spouseLikes.delete(data.name);
        updateMatches();
    }
}

function updateMatches() {
    const myLikes = new Set(getLikes());
    const matches = [...myLikes].filter(name => spouseLikes.has(name));

    if (onMatchesUpdated) {
        onMatchesUpdated(matches);
    }
}

function sendLikes() {
    publishMessage({
        type: 'likes',
        likes: getLikes()
    });
}

export async function joinSession(topic) {
    if (!topic || topic.trim() === '') {
        throw new Error('Room code is required');
    }

    nextSessionGeneration();
    const trimmedTopic = topic.trim().toLowerCase();

    clearReconnectTimer();
    reconnectAttempt = 0;
    isReconnecting = false;
    hasSpouseJoined = false;

    currentTopic = trimmedTopic;
    setSessionTopic(trimmedTopic);

    try {
        await connectWebSocket(trimmedTopic);
        sendLikes();
        return true;
    } catch (err) {
        logError(err, 'Join session');
        currentTopic = null;
        clearSessionTopic();
        hasSpouseJoined = false;
        setStatus(ConnectionStatus.ERROR, getErrorMessage(err));
        throw err;
    }
}

export async function createSession() {
    const topic = generateTopic();
    await joinSession(topic);
    return topic;
}

export async function generateShareLink() {
    const topic = currentTopic || getSessionTopic();
    if (!topic) {
        throw new Error('No active session');
    }

    const url = new URL(window.location.href);
    url.searchParams.set('room', topic);
    return url.toString();
}

export function getRoomFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('room');
}

export function clearRoomParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
}

export async function createNewSession() {
    return createSession();
}

export async function notifyLike(name) {
    if (!currentTopic) return;

    await publishMessage({
        type: 'like',
        name: name
    });

    if (spouseLikes.has(name) && onMatchFound) {
        onMatchFound(name);
    }
}

export async function notifyUnlike(name) {
    if (!currentTopic) return;

    await publishMessage({
        type: 'unlike',
        name: name
    });
}

export function getMatches() {
    const myLikes = new Set(getLikes());
    return [...myLikes].filter(name => spouseLikes.has(name));
}

export function getSpouseLikes() {
    return new Set(spouseLikes);
}

export function isConnected() {
    return hasSpouseJoined;
}

export function isInRoom() {
    return socket && socket.readyState === WebSocket.OPEN;
}

export function getCurrentTopic() {
    return currentTopic;
}

export function getStoredSessionTopic() {
    return getSessionTopic();
}

export function hasStoredSession() {
    return !!getSessionTopic();
}

export async function tryReconnect() {
    const topic = getSessionTopic();
    if (!topic) {
        return false;
    }

    try {
        setStatus(ConnectionStatus.CONNECTING, 'Reconnecting...');
        await connectWebSocket(topic);
        sendLikes();
        return true;
    } catch (err) {
        console.error('Failed to reconnect:', err);
        setStatus(ConnectionStatus.IN_ROOM, 'Unable to reconnect');
        return false;
    }
}

export async function disconnect(createNew = true) {
    nextSessionGeneration();
    clearReconnectTimer();
    reconnectAttempt = 0;
    isReconnecting = false;
    hasSpouseJoined = false;
    connectPromise = null;

    clearSessionTopic();

    if (socket) {
        socket.close();
        socket = null;
    }

    currentTopic = null;
    spouseLikes.clear();

    if (createNew) {
        setStatus(ConnectionStatus.CONNECTING, 'Creating new connection...');

        try {
            await createNewSession();
        } catch (err) {
            console.error('Failed to create new session:', err);
            setStatus(ConnectionStatus.DISCONNECTED, 'Failed to create new connection');
        }
    } else {
        setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
    }

    if (onConnectionChange) {
        onConnectionChange(false);
    }
    if (onMatchesUpdated) {
        onMatchesUpdated([]);
    }
}

export async function initializeAndReconnect() {
    const topic = getSessionTopic();
    if (topic) {
        try {
            nextSessionGeneration();
            hasSpouseJoined = false;
            await connectWebSocket(topic);
            sendLikes();
        } catch (err) {
            console.log('[ntfy] Stored session not available, creating new...');
            try {
                await createNewSession();
            } catch (createErr) {
                console.error('Failed to create new session:', createErr);
            }
        }
    } else {
        try {
            await createNewSession();
        } catch (err) {
            console.error('Failed to create initial session:', err);
        }
    }
}
