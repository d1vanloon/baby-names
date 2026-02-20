/**
 * Session sync and match logic
 */

import {
    getLikes,
    getInstanceId,
    getPartnerLikes,
    setPartnerLikes,
    clearPartnerLikes
} from './storage.js';

const DEBOUNCE_MS = 400;

export function createSessionSync(config) {
    let myLikeVersion = 0;
    let pendingLikeBuffer = new Set();
    let debounceTimer = null;

    let partnerState = {
        likes: new Set(),
        likeVersion: 0
    };

    let knownMatches = new Set();

    function emitMatches() {
        const matches = getMatches();
        knownMatches = new Set(matches);
        config.onMatchesUpdated(matches);
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
        config.onConnectionChange(true);
        config.onConnected();
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

    async function publishSnapshot() {
        await config.publishMessage('state_snapshot', {
            likes: getLikes(),
            likeVersion: myLikeVersion
        });
    }

    async function handleLikesBatch(message) {
        const incomingLikes = Array.isArray(message.payload?.likes)
            ? message.payload.likes
            : [];

        const incomingVersion = Number.isFinite(message.payload?.likeVersion)
            ? message.payload.likeVersion
            : null;

        if (incomingVersion === null || incomingVersion !== partnerState.likeVersion + 1) {
            await config.publishMessage('resync_request', {
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
        config.onConnectionChange(true);
        config.onConnected();
    }

    async function flushPendingLikes() {
        debounceTimer = null;
        if (!config.isInRoom() || pendingLikeBuffer.size === 0) {
            return;
        }

        const likes = [...pendingLikeBuffer];
        pendingLikeBuffer.clear();
        myLikeVersion += 1;

        try {
            await config.publishMessage('likes_batch', {
                likes,
                likeVersion: myLikeVersion
            });
        } catch (err) {
            console.error('[ntfy] Failed to publish likes batch:', err);
        }
    }

    function clearPendingLikes() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        pendingLikeBuffer.clear();
    }

    function resetPartnerState() {
        partnerState = {
            likes: new Set(),
            likeVersion: 0
        };
        knownMatches = new Set();
        clearPartnerLikes();
    }

    async function sendJoinHandshake() {
        await config.publishMessage('join', {
            likeVersion: myLikeVersion
        });

        await publishSnapshot();
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

    function prepareForJoin() {
        clearPendingLikes();
        resetPartnerState();
        myLikeVersion = 0;
    }

    function initializeFromStorage() {
        partnerState.likes = getPartnerLikes();
        partnerState.likeVersion = 0;
        emitMatches();
    }

    function notifyLike(name) {
        if (!config.isInRoom() || !name) {
            return;
        }

        pendingLikeBuffer.add(name);

        if (partnerState.likes.has(name)) {
            const matches = getMatches();
            if (matches.includes(name) && !knownMatches.has(name)) {
                config.onMatchFound(name);
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

    function getMatches() {
        const likes = getLikes();
        return likes.filter((name) => partnerState.likes.has(name));
    }

    function getSpouseLikes() {
        return new Set(partnerState.likes);
    }

    return {
        initializeFromStorage,
        prepareForJoin,
        sendJoinHandshake,
        handleMessage,
        notifyLike,
        clearPendingLikes,
        resetPartnerState,
        getMatches,
        getSpouseLikes,
        emitMatches
    };
}
