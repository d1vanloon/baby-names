/**
 * Ntfy-based room session and sync module
 */

import {
    getLikes,
    getSessionTopic,
    setSessionTopic,
    clearSessionTopic,
    getInstanceId,
    getPartnerLikes,
    setPartnerLikes,
    clearPartnerLikes
} from './storage.js';

export const ConnectionStatus = Object.freeze({
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    IN_ROOM: 'IN_ROOM',
    CONNECTED: 'CONNECTED',
    ERROR: 'ERROR'
});

const NTFY_HOST = 'ntfy.sh';
const TOPIC_PREFIX = 'baby-names-';
const ROOM_CODE_PATTERN = /^[a-z0-9]{8}$/;
const DEBOUNCE_MS = 400;

let currentTopic = null;
let socket = null;
let sessionGeneration = 0;
let status = ConnectionStatus.DISCONNECTED;

let myLikeVersion = 0;
let pendingLikeBuffer = new Set();
let debounceTimer = null;

let partnerState = {
    likes: new Set(),
    likeVersion: 0
};

let knownMatches = new Set();

let callbacks = {
    onMatchFound: () => {},
    onConnectionChange: () => {},
    onMatchesUpdated: () => {},
    onStatusChange: () => {}
};

function normalizeRoomCode(roomCode) {
    return String(roomCode || '').trim().toLowerCase();
}

function buildTopic(roomCode) {
    return `${TOPIC_PREFIX}${roomCode}`;
}

function setStatus(nextStatus, message) {
    status = nextStatus;
    callbacks.onStatusChange(status, message);
}

function emitMatches() {
    const matches = getMatches();
    knownMatches = new Set(matches);
    callbacks.onMatchesUpdated(matches);
}

function resetPartnerState() {
    partnerState = {
        likes: new Set(),
        likeVersion: 0
    };
    knownMatches = new Set();
    clearPartnerLikes();
}

function clearPendingLikes() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    pendingLikeBuffer.clear();
}

function closeSocket() {
    if (socket) {
        try {
            socket.close();
        } catch (err) {
            console.warn('[ntfy] Failed to close socket:', err);
        }
    }
    socket = null;
}

function createRoomCode() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}

function getTopicName() {
    if (!currentTopic) {
        return null;
    }
    return buildTopic(currentTopic);
}

function parseIncomingEvent(eventData, expectedTopicName) {
    const payload = JSON.parse(eventData);
    if (payload.event !== 'message' || payload.topic !== expectedTopicName) {
        return null;
    }

    const message = JSON.parse(payload.message);
    if (!message || typeof message !== 'object') {
        return null;
    }

    return message;
}

async function publishMessage(type, payload) {
    if (!currentTopic) {
        return;
    }

    const message = {
        type,
        roomId: currentTopic,
        senderId: getInstanceId(),
        payload
    };

    const topicName = getTopicName();
    const url = `https://${NTFY_HOST}/${topicName}`;

    await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'no'
        },
        body: JSON.stringify(message)
    });
}

async function publishSnapshot() {
    await publishMessage('state_snapshot', {
        likes: getLikes(),
        likeVersion: myLikeVersion
    });
}

async function sendJoinHandshake() {
    await publishMessage('join', {
        likeVersion: myLikeVersion
    });

    await publishSnapshot();
}

function applyPartnerSnapshot(snapshotPayload) {
    const likes = Array.isArray(snapshotPayload?.likes) ? snapshotPayload.likes : [];
    const likeVersion = Number.isFinite(snapshotPayload?.likeVersion)
        ? snapshotPayload.likeVersion
        : 0;

    partnerState.likes = new Set(likes);
    partnerState.likeVersion = likeVersion;
    setPartnerLikes([...partnerState.likes]);
    emitMatches();
    callbacks.onConnectionChange(true);
    setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse!');
}

function resolveSnapshotPayload(message) {
    const payload = message.payload;
    if (Array.isArray(payload?.users)) {
        const senderState = payload.users.find((entry) => entry.userId === message.senderId);
        if (!senderState) {
            return null;
        }
        return {
            likes: Array.isArray(senderState.likes) ? senderState.likes : [],
            likeVersion: Number.isFinite(senderState.likeVersion) ? senderState.likeVersion : 0
        };
    }

    return {
        likes: Array.isArray(payload?.likes) ? payload.likes : [],
        likeVersion: Number.isFinite(payload?.likeVersion) ? payload.likeVersion : 0
    };
}

async function handleLikesBatch(message) {
    const incomingLikes = Array.isArray(message.payload?.likes)
        ? message.payload.likes
        : [];

    const incomingVersion = Number.isFinite(message.payload?.likeVersion)
        ? message.payload.likeVersion
        : null;

    if (incomingVersion === null || incomingVersion !== partnerState.likeVersion + 1) {
        await publishMessage('resync_request', {
            knownVersion: partnerState.likeVersion
        });
        return;
    }

    for (const like of incomingLikes) {
        partnerState.likes.add(like);
    }
    partnerState.likeVersion = incomingVersion;
    setPartnerLikes([...partnerState.likes]);

    emitMatches();
    callbacks.onConnectionChange(true);
    if (status !== ConnectionStatus.CONNECTED) {
        setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse!');
    }
}

async function handleMessage(message) {
    if (!message || message.senderId === getInstanceId()) {
        return;
    }

    switch (message.type) {
        case 'join':
            await publishSnapshot();
            break;
        case 'state_snapshot': {
            const snapshot = resolveSnapshotPayload(message);
            if (snapshot) {
                applyPartnerSnapshot(snapshot);
            }
            break;
        }
        case 'likes_batch':
            await handleLikesBatch(message);
            break;
        case 'resync_request':
            await publishSnapshot();
            break;
        case 'resync_response':
            applyPartnerSnapshot({
                likes: Array.isArray(message.payload?.likes) ? message.payload.likes : [],
                likeVersion: Number.isFinite(message.payload?.likeVersion)
                    ? message.payload.likeVersion
                    : partnerState.likeVersion
            });
            break;
        default:
            break;
    }
}

async function openSocket(roomCode) {
    const topicName = buildTopic(roomCode);
    const generation = ++sessionGeneration;

    closeSocket();

    return new Promise((resolve, reject) => {
        const wsUrl = `wss://${NTFY_HOST}/${topicName}/ws`;
        const ws = new WebSocket(wsUrl);
        socket = ws;

        let settled = false;
        const timeoutId = setTimeout(() => {
            if (!settled) {
                settled = true;
                setStatus(ConnectionStatus.ERROR, 'Connection timed out');
                reject(new Error('Connection timed out'));
            }
        }, 10000);

        ws.onopen = async () => {
            if (generation !== sessionGeneration) {
                return;
            }

            try {
                await sendJoinHandshake();
                setStatus(ConnectionStatus.IN_ROOM, 'Ready to connect, waiting for spouse...');

                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve();
                }
            } catch (err) {
                setStatus(ConnectionStatus.ERROR, 'Failed to publish join message');
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    reject(err);
                }
            }
        };

        ws.onmessage = async (event) => {
            if (generation !== sessionGeneration) {
                return;
            }

            try {
                const message = parseIncomingEvent(event.data, topicName);
                if (!message) {
                    return;
                }
                await handleMessage(message);
            } catch (err) {
                console.warn('[ntfy] Failed to process message:', err);
            }
        };

        ws.onerror = () => {
            if (generation !== sessionGeneration) {
                return;
            }

            setStatus(ConnectionStatus.ERROR, 'Connection error');
            callbacks.onConnectionChange(false);

            if (!settled) {
                settled = true;
                clearTimeout(timeoutId);
                reject(new Error('WebSocket connection error'));
            }
        };

        ws.onclose = () => {
            if (generation !== sessionGeneration) {
                return;
            }

            callbacks.onConnectionChange(false);
            if (status !== ConnectionStatus.ERROR) {
                setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
            }
        };
    });
}

async function flushPendingLikes() {
    debounceTimer = null;
    if (!currentTopic || pendingLikeBuffer.size === 0) {
        return;
    }

    const likes = [...pendingLikeBuffer];
    pendingLikeBuffer.clear();
    myLikeVersion += 1;

    try {
        await publishMessage('likes_batch', {
            likes,
            likeVersion: myLikeVersion
        });
    } catch (err) {
        console.error('[ntfy] Failed to publish likes batch:', err);
    }
}

export function initPeerSession(nextCallbacks = {}) {
    callbacks = {
        ...callbacks,
        ...nextCallbacks
    };

    partnerState.likes = getPartnerLikes();
    partnerState.likeVersion = 0;
    emitMatches();
    callbacks.onConnectionChange(false);
    setStatus(ConnectionStatus.DISCONNECTED, 'Enter a code to connect or start a new connection');
}

export function getRoomFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const room = normalizeRoomCode(params.get('room'));
    return ROOM_CODE_PATTERN.test(room) ? room : null;
}

export function clearRoomParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function joinSession(roomCode) {
    const normalizedRoom = normalizeRoomCode(roomCode);
    if (!ROOM_CODE_PATTERN.test(normalizedRoom)) {
        throw new Error('Invalid room code');
    }

    clearPendingLikes();
    resetPartnerState();

    currentTopic = normalizedRoom;
    setSessionTopic(normalizedRoom);
    myLikeVersion = 0;

    setStatus(ConnectionStatus.CONNECTING, 'Connecting...');
    await openSocket(normalizedRoom);
    return normalizedRoom;
}

export async function createNewSession() {
    const roomCode = createRoomCode();
    return joinSession(roomCode);
}

export async function initializeAndReconnect() {
    const storedTopic = getSessionTopic();
    if (storedTopic && ROOM_CODE_PATTERN.test(normalizeRoomCode(storedTopic))) {
        return joinSession(storedTopic);
    }
    return createNewSession();
}

export function notifyLike(name) {
    if (!currentTopic || !name) {
        return;
    }

    pendingLikeBuffer.add(name);

    if (partnerState.likes.has(name)) {
        const matches = getMatches();
        if (matches.includes(name) && !knownMatches.has(name)) {
            callbacks.onMatchFound(name);
            emitMatches();
        }
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        flushPendingLikes();
    }, DEBOUNCE_MS);
}

export function isConnected() {
    return status === ConnectionStatus.CONNECTED;
}

export function isInRoom() {
    return Boolean(currentTopic);
}

export async function disconnect() {
    clearPendingLikes();
    closeSocket();
    sessionGeneration += 1;

    currentTopic = null;
    myLikeVersion = 0;
    resetPartnerState();
    clearSessionTopic();

    callbacks.onConnectionChange(false);
    setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
    emitMatches();

    return createNewSession();
}

export function getMatches() {
    const likes = getLikes();
    return likes.filter((name) => partnerState.likes.has(name));
}

export function getSpouseLikes() {
    return new Set(partnerState.likes);
}

export function getCurrentTopic() {
    return currentTopic;
}

export function getStoredSessionTopic() {
    return getSessionTopic();
}

export async function generateShareLink() {
    if (!currentTopic) {
        await createNewSession();
    }

    const url = new URL(window.location.href);
    url.searchParams.set('room', currentTopic);
    return `${url.origin}${url.pathname}${url.search}`;
}
