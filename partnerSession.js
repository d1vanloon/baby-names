import nacl from 'tweetnacl';
import {
    addLike,
    getLikes,
    getPartnerLikes,
    setPartnerLikes,
    clearPartnerLikes,
    getInstanceId,
    getPairingToken,
    setPairingToken,
    clearPairingToken
} from './storage.js';
import { createDerpTransport, generateKeypair } from './derpTransport.js';

const TOKEN_PREFIX = 'bn1.';
const DEFAULT_HOST = 'derp12d.tailscale.com';
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_STALE_MS = 30000;
const LIKE_DEBOUNCE_MS = 400;

const Machine = Object.freeze({
    Idle: 'Idle',
    Hosting: 'Hosting',
    Joining: 'Joining',
    Relayed: 'Relayed',
    Synced: 'Synced',
    Error: 'Error'
});

function asBytes(value) {
    return new Uint8Array(value);
}

function bytesToB64Url(bytes) {
    let binary = '';
    const view = asBytes(bytes);
    for (let i = 0; i < view.length; i++) {
        binary += String.fromCharCode(view[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(text) {
    const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

/**
 * @param {Uint8Array} publicKey
 * @param {string} host
 * @returns {string}
 */
export function encodePairingToken(publicKey, host) {
    return `${TOKEN_PREFIX}${bytesToB64Url(publicKey)}.${bytesToB64Url(new TextEncoder().encode(host))}`;
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isValidDerpHost(host) {
    if (!host || /[\s/?#]/.test(host)) {
        return false;
    }
    return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host);
}

/**
 * @param {string} token
 * @returns {{ publicKey: Uint8Array, host: string } | null}
 */
export function decodePairingToken(token) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) {
        return null;
    }
    const rest = token.slice(TOKEN_PREFIX.length);
    const dot = rest.indexOf('.');
    if (dot < 1) {
        return null;
    }
    try {
        const publicKey = b64UrlToBytes(rest.slice(0, dot));
        const host = new TextDecoder().decode(b64UrlToBytes(rest.slice(dot + 1)));
        if (publicKey.length !== 32 || !isValidDerpHost(host)) {
            return null;
        }
        return { publicKey, host };
    } catch {
        return null;
    }
}

/**
 * First hello wins. Later senders are ignored.
 * @param {string | null} boundPeerB64
 * @param {string} fromB64
 * @returns {{ peerB64: string, accepted: boolean }}
 */
export function acceptPeer(boundPeerB64, fromB64) {
    if (!boundPeerB64) {
        return { peerB64: fromB64, accepted: true };
    }
    return { peerB64: boundPeerB64, accepted: boundPeerB64 === fromB64 };
}

function publicStatus(machine) {
    if (machine === Machine.Idle) {
        return 'idle';
    }
    if (machine === Machine.Synced) {
        return 'paired';
    }
    if (machine === Machine.Error) {
        return 'error';
    }
    return 'connecting';
}

function keypairFromSecret(secretKey) {
    const secret = asBytes(secretKey);
    const pair = nacl.box.keyPair.fromSecretKey(secret);
    return {
        publicKey: asBytes(pair.publicKey),
        secretKey: asBytes(pair.secretKey)
    };
}

/**
 * Deep pairing module. App.js imports this file only.
 *
 * @param {{
 *   createTransport?: () => ReturnType<typeof createDerpTransport>,
 *   defaultHost?: string,
 *   now?: () => number,
 *   heartbeatIntervalMs?: number,
 *   heartbeatStaleMs?: number,
 *   debounceMs?: number
 * }} [opts]
 */
function defaultStore() {
    return {
        addLike,
        getLikes,
        getPartnerLikes,
        setPartnerLikes,
        clearPartnerLikes,
        getInstanceId,
        getPairingToken,
        setPairingToken,
        clearPairingToken
    };
}

export function createPartnerSession(opts = {}) {
    const createTransport = opts.createTransport || (() => createDerpTransport());
    const defaultHost = opts.defaultHost || DEFAULT_HOST;
    const now = opts.now || (() => Date.now());
    const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    const heartbeatStaleMs = opts.heartbeatStaleMs ?? HEARTBEAT_STALE_MS;
    const debounceMs = opts.debounceMs ?? LIKE_DEBOUNCE_MS;
    const store = opts.store || defaultStore();

    function readRecord() {
        const raw = store.getPairingToken();
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || (parsed.role !== 'host' && parsed.role !== 'guest')) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    function writeRecord(next) {
        store.setPairingToken(JSON.stringify(next));
    }

    const transport = createTransport();
    let machine = Machine.Idle;
    let statusMessage = '';
    let callbacks = {};
    let record = null;
    let partnerLikes = store.getPartnerLikes();
    let pendingLikes = new Set();
    let debounceTimer = null;
    let heartbeatTimer = null;
    let lastHeartbeatAt = 0;
    let hostPublic = null;

    function emitStatus() {
        if (callbacks.onStatus) {
            callbacks.onStatus(publicStatus(machine), statusMessage);
        }
    }

    function emitMatches() {
        const names = matches();
        if (callbacks.onMatches) {
            callbacks.onMatches(names);
        }
        if (callbacks.onPartnerLikes) {
            callbacks.onPartnerLikes(new Set(partnerLikes));
        }
    }

    function setMachine(next, message = '') {
        machine = next;
        statusMessage = message;
        emitStatus();
    }

    function persistPartner() {
        store.setPartnerLikes([...partnerLikes]);
    }

    function matches() {
        return store.getLikes().filter((name) => partnerLikes.has(name));
    }

    function stopHeartbeats() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    async function sendInner(peerPub, message) {
        const body = new Uint8Array(new TextEncoder().encode(JSON.stringify(message)));
        await transport.send(peerPub, body);
    }

    async function sendHello() {
        const dest = record?.peerPubB64
            ? b64UrlToBytes(record.peerPubB64)
            : hostPublic;
        if (!dest) {
            return;
        }
        await sendInner(dest, { instanceId: store.getInstanceId(), type: 'hello' });
    }

    async function sendSnapshot() {
        if (!record?.peerPubB64) {
            return;
        }
        await sendInner(b64UrlToBytes(record.peerPubB64), {
            instanceId: store.getInstanceId(),
            type: 'snapshot',
            likes: store.getLikes()
        });
    }

    async function sendHeartbeat() {
        if (!record?.peerPubB64 || machine !== Machine.Synced) {
            return;
        }
        await sendInner(b64UrlToBytes(record.peerPubB64), {
            instanceId: store.getInstanceId(),
            type: 'heartbeat'
        });
    }

    function startHeartbeats() {
        stopHeartbeats();
        heartbeatTimer = setInterval(() => {
            if (machine === Machine.Synced && now() - lastHeartbeatAt > heartbeatStaleMs) {
                setMachine(Machine.Relayed, 'Partner went quiet, reconnecting');
                reconnectTransport();
                return;
            }
            sendHeartbeat().catch((err) => {
                console.error('heartbeat failed', err);
            });
        }, heartbeatIntervalMs);
    }

    function bindPeer(from) {
        const fromB64 = bytesToB64Url(from);
        const result = acceptPeer(record?.peerPubB64 || null, fromB64);
        if (!result.accepted) {
            return false;
        }
        if (!record) {
            return false;
        }
        if (!record.peerPubB64) {
            record = { ...record, peerPubB64: result.peerB64 };
            writeRecord(record);
        }
        return true;
    }

    async function handleInner(from, plaintext) {
        let message;
        try {
            message = JSON.parse(new TextDecoder().decode(plaintext));
        } catch {
            return;
        }
        if (!message || message.instanceId === store.getInstanceId()) {
            return;
        }
        if (message.type === 'hello' || message.type === 'heartbeat'
            || message.type === 'snapshot' || message.type === 'likes_add') {
            if (!bindPeer(from)) {
                return;
            }
        } else {
            return;
        }

        if (message.type === 'hello') {
            lastHeartbeatAt = now();
            if (record?.role === 'host') {
                hostPublic = asBytes(from);
            }
            setMachine(Machine.Synced, 'Connected');
            startHeartbeats();
            await sendSnapshot();
            return;
        }

        if (message.type === 'heartbeat') {
            lastHeartbeatAt = now();
            if (machine !== Machine.Synced) {
                setMachine(Machine.Synced, 'Connected');
                startHeartbeats();
            }
            return;
        }

        if (message.type === 'snapshot') {
            lastHeartbeatAt = now();
            const likes = Array.isArray(message.likes) ? message.likes : [];
            partnerLikes = new Set(likes);
            persistPartner();
            emitMatches();
            if (machine !== Machine.Synced) {
                setMachine(Machine.Synced, 'Connected');
                startHeartbeats();
                await sendSnapshot();
            }
            return;
        }

        if (message.type === 'likes_add') {
            lastHeartbeatAt = now();
            const likes = Array.isArray(message.likes) ? message.likes : [];
            for (const name of likes) {
                partnerLikes.add(name);
            }
            persistPartner();
            emitMatches();
        }
    }

    async function openTransport(keypair, host, nextMachine) {
        transport.onPacket((from, plaintext) => {
            handleInner(from, plaintext).catch((err) => {
                console.error('partner message failed', err);
            });
        });
        await transport.connect(host, keypair);
        setMachine(nextMachine);
    }

    async function reconnectTransport() {
        if (!record) {
            return;
        }
        const keypair = keypairFromSecret(b64UrlToBytes(record.secretKeyB64));
        try {
            await openTransport(keypair, record.host, Machine.Relayed);
            if (record.role === 'guest') {
                hostPublic = decodePairingToken(record.token)?.publicKey || hostPublic;
                await sendHello();
            }
        } catch (err) {
            setMachine(Machine.Error, err.message || 'Reconnect failed');
        }
    }

    function flushLikes() {
        debounceTimer = null;
        if (machine !== Machine.Synced || !record?.peerPubB64 || pendingLikes.size === 0) {
            pendingLikes = new Set();
            return;
        }
        const likes = [...pendingLikes];
        pendingLikes = new Set();
        sendInner(b64UrlToBytes(record.peerPubB64), {
            instanceId: store.getInstanceId(),
            type: 'likes_add',
            likes
        }).catch((err) => {
            console.error('likes_add failed', err);
        });
    }

    async function host() {
        if (record?.role === 'host' && record.token) {
            if (!transport.isUp()) {
                await reconnectTransport();
            }
            if (callbacks.onToken) {
                callbacks.onToken(record.token);
            }
            return record.token;
        }

        const keypair = generateKeypair();
        const token = encodePairingToken(keypair.publicKey, defaultHost);
        record = {
            role: 'host',
            token,
            host: defaultHost,
            secretKeyB64: bytesToB64Url(keypair.secretKey)
        };
        writeRecord(record);
        hostPublic = null;
        setMachine(Machine.Hosting, 'Waiting for partner');
        if (callbacks.onToken) {
            callbacks.onToken(token);
        }
        try {
            await openTransport(keypair, defaultHost, Machine.Relayed);
        } catch (err) {
            setMachine(Machine.Error, err.message || 'Failed to host');
            throw err;
        }
        return token;
    }

    async function join(token) {
        const parsed = decodePairingToken(token);
        if (!parsed) {
            setMachine(Machine.Error, 'Invalid pairing link');
            throw new Error('Invalid pairing link');
        }
        const keypair = generateKeypair();
        record = {
            role: 'guest',
            token,
            host: parsed.host,
            secretKeyB64: bytesToB64Url(keypair.secretKey)
        };
        writeRecord(record);
        hostPublic = parsed.publicKey;
        partnerLikes = new Set();
        persistPartner();
        setMachine(Machine.Joining, 'Joining partner');
        try {
            await openTransport(keypair, parsed.host, Machine.Relayed);
            await sendHello();
        } catch (err) {
            setMachine(Machine.Error, err.message || 'Failed to join');
            throw err;
        }
    }

    function like(name) {
        if (!name) {
            return;
        }
        const alreadyMatch = partnerLikes.has(name) && store.getLikes().includes(name);
        store.addLike(name);
        if (partnerLikes.has(name) && !alreadyMatch && callbacks.onMatch) {
            callbacks.onMatch(name);
        }
        emitMatches();
        pendingLikes.add(name);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(flushLikes, debounceMs);
    }

    async function disconnect() {
        stopHeartbeats();
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        pendingLikes = new Set();
        transport.close();
        record = null;
        hostPublic = null;
        partnerLikes = new Set();
        store.clearPairingToken();
        store.clearPartnerLikes();
        setMachine(Machine.Idle, '');
        emitMatches();
        if (callbacks.onToken) {
            callbacks.onToken('');
        }
    }

    function subscribe(nextCallbacks) {
        callbacks = nextCallbacks || {};
        const shouldResume = callbacks.resume !== false;
        emitStatus();
        emitMatches();
        const stored = readRecord();
        if (stored) {
            record = stored;
            partnerLikes = store.getPartnerLikes();
            if (callbacks.onToken && stored.token) {
                callbacks.onToken(stored.token);
            }
            if (shouldResume) {
                reconnectTransport();
            }
        }
        return () => {
            callbacks = {};
        };
    }

    return {
        host,
        join,
        like,
        disconnect,
        subscribe,
        matches,
        get hasStoredPairing() {
            return Boolean(readRecord() || record);
        }
    };
}
