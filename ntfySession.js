/**
 * Ntfy-based room session and sync module
 */

import {
    getSessionTopic,
    setSessionTopic,
    clearSessionTopic,
    getInstanceId
} from './storage.js';
import { createSessionSync } from './sessionSync.js';

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

let currentTopic = null;
let socket = null;
let sessionGeneration = 0;
let status = ConnectionStatus.DISCONNECTED;

let callbacks = {
    onMatchFound: () => {},
    onConnectionChange: () => {},
    onMatchesUpdated: () => {},
    onStatusChange: () => {}
};

const sync = createSessionSync({
    publishMessage,
    onMatchFound: (name) => callbacks.onMatchFound(name),
    onConnectionChange: (connected) => callbacks.onConnectionChange(connected),
    onMatchesUpdated: (matches) => callbacks.onMatchesUpdated(matches),
    onConnected: () => {
        if (status !== ConnectionStatus.CONNECTED) {
            setStatus(ConnectionStatus.CONNECTED, 'Connected to spouse!');
        }
    },
    isInRoom: () => Boolean(currentTopic)
});

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
                await sync.sendJoinHandshake();
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
                await sync.handleMessage(message);
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

export function initPeerSession(nextCallbacks = {}) {
    callbacks = {
        ...callbacks,
        ...nextCallbacks
    };

    sync.initializeFromStorage();
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

    sync.prepareForJoin();

    currentTopic = normalizedRoom;
    setSessionTopic(normalizedRoom);

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
    sync.notifyLike(name);
}

export function isConnected() {
    return status === ConnectionStatus.CONNECTED;
}

export function isInRoom() {
    return Boolean(currentTopic);
}

export async function disconnect() {
    sync.clearPendingLikes();
    closeSocket();
    sessionGeneration += 1;

    currentTopic = null;
    sync.prepareForJoin();
    clearSessionTopic();

    callbacks.onConnectionChange(false);
    setStatus(ConnectionStatus.DISCONNECTED, 'Disconnected');
    sync.emitMatches();
}

export function getMatches() {
    return sync.getMatches();
}

export function getSpouseLikes() {
    return sync.getSpouseLikes();
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
