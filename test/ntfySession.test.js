import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { state, storageMocks } = vi.hoisted(() => {
    const hoistedState = {
        likes: ['Emma', 'Ava'],
        sessionTopic: null,
        instanceId: 'instance-1',
        partnerLikes: []
    };

    const mocks = {
        getLikes: vi.fn(() => [...hoistedState.likes]),
        getSessionTopic: vi.fn(() => hoistedState.sessionTopic),
        setSessionTopic: vi.fn((topic) => { hoistedState.sessionTopic = topic; }),
        clearSessionTopic: vi.fn(() => { hoistedState.sessionTopic = null; }),
        getInstanceId: vi.fn(() => hoistedState.instanceId),
        getPartnerLikes: vi.fn(() => new Set(hoistedState.partnerLikes)),
        setPartnerLikes: vi.fn((likes) => { hoistedState.partnerLikes = [...likes]; }),
        clearPartnerLikes: vi.fn(() => { hoistedState.partnerLikes = []; })
    };

    return {
        state: hoistedState,
        storageMocks: mocks
    };
});

vi.mock('../storage.js', () => storageMocks);

import {
    initPeerSession,
    joinSession,
    notifyLike,
    disconnect,
    isInRoom,
    getMatches,
    getCurrentTopic,
    getRoomFromUrl,
    clearRoomParam,
    generateShareLink
} from '../ntfySession.js';

class FakeWebSocket {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 1;
        FakeWebSocket.instances.push(this);
        setTimeout(() => {
            if (typeof this.onopen === 'function') {
                this.onopen();
            }
        }, 0);
    }

    close() {
        this.readyState = 3;
        if (typeof this.onclose === 'function') {
            this.onclose();
        }
    }

    emitMessage(data) {
        if (typeof this.onmessage === 'function') {
            this.onmessage({ data });
        }
    }
}

function flushAsync() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ntfySession.js', () => {
    const callbacks = {
        onMatchFound: vi.fn(),
        onConnectionChange: vi.fn(),
        onMatchesUpdated: vi.fn(),
        onStatusChange: vi.fn()
    };

    beforeEach(() => {
        state.likes = ['Emma', 'Ava'];
        state.sessionTopic = null;
        state.instanceId = 'instance-1';
        state.partnerLikes = [];

        vi.clearAllMocks();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));

        window.history.replaceState({}, '', '/');
        initPeerSession(callbacks);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('parses room code from URL and clears it', () => {
        window.history.replaceState({}, '', '/?room=A7X2K9M1');
        expect(getRoomFromUrl()).toBe('a7x2k9m1');

        clearRoomParam();
        expect(window.location.search).toBe('');
    });

    it('joins a room and generates a share link', async () => {
        await joinSession('a7x2k9m1');
        await flushAsync();

        expect(isInRoom()).toBe(true);
        expect(getCurrentTopic()).toBe('a7x2k9m1');

        const shareLink = await generateShareLink();
        expect(shareLink).toContain('?room=a7x2k9m1');
        expect(storageMocks.setSessionTopic).toHaveBeenCalledWith('a7x2k9m1');
    });

    it('batches likes and updates matches from incoming batch without celebration', async () => {
        await joinSession('a7x2k9m1');
        await flushAsync();

        notifyLike('Olivia');
        notifyLike('Noah');
        await new Promise((resolve) => setTimeout(resolve, 450));

        const postedBodies = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
        const likesBatch = postedBodies.find((message) => message.type === 'likes_batch');
        expect(likesBatch).toBeTruthy();
        expect(likesBatch.payload.likeVersion).toBe(1);
        expect(new Set(likesBatch.payload.likes)).toEqual(new Set(['Olivia', 'Noah']));

        const ws = FakeWebSocket.instances[0];
        ws.emitMessage(JSON.stringify({
            event: 'message',
            topic: 'baby-names-a7x2k9m1',
            message: JSON.stringify({
                type: 'likes_batch',
                roomId: 'a7x2k9m1',
                senderId: 'instance-2',
                payload: {
                    likes: ['Emma'],
                    likeVersion: 1
                }
            })
        }));
        await flushAsync();

        expect(callbacks.onMatchFound).not.toHaveBeenCalled();
        expect(callbacks.onMatchesUpdated).toHaveBeenLastCalledWith(expect.arrayContaining(['Emma']));
        expect(getMatches()).toContain('Emma');
    });

    it('celebrates locally when notifyLike completes a match', async () => {
        await joinSession('a7x2k9m1');
        await flushAsync();

        const ws = FakeWebSocket.instances[0];
        ws.emitMessage(JSON.stringify({
            event: 'message',
            topic: 'baby-names-a7x2k9m1',
            message: JSON.stringify({
                type: 'state_snapshot',
                roomId: 'a7x2k9m1',
                senderId: 'instance-2',
                payload: {
                    likes: ['Olivia'],
                    likeVersion: 1
                }
            })
        }));
        await flushAsync();

        state.likes.push('Olivia');
        notifyLike('Olivia');

        expect(callbacks.onMatchFound).toHaveBeenCalledWith('Olivia');
        expect(callbacks.onMatchesUpdated).toHaveBeenLastCalledWith(expect.arrayContaining(['Olivia']));

        notifyLike('Olivia');
        expect(callbacks.onMatchFound).toHaveBeenCalledTimes(1);

        await new Promise((resolve) => setTimeout(resolve, 450));
    });

    it('disconnects and auto-creates a fresh room', async () => {
        await joinSession('a7x2k9m1');
        await flushAsync();

        await disconnect();
        await flushAsync();

        expect(storageMocks.clearSessionTopic).toHaveBeenCalled();
        expect(getCurrentTopic()).toMatch(/^[a-z0-9]{8}$/);
        expect(storageMocks.setSessionTopic).toHaveBeenCalledTimes(2);
    });
});
