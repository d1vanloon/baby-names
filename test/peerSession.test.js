import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage.js', () => ({
    getLikes: vi.fn(() => []),
    getSessionTopic: vi.fn(() => null),
    setSessionTopic: vi.fn(),
    clearSessionTopic: vi.fn(),
    getInstanceId: vi.fn(() => 'test-instance-id')
}));

import {
    initPeerSession,
    getConnectionStatus,
    getMatches,
    getSpouseLikes,
    isConnected,
    hasStoredSession,
    getCurrentTopic,
    ConnectionStatus,
    joinSession,
    disconnect
} from '../peerSession.js';

import { getLikes, getSessionTopic, getInstanceId } from '../storage.js';

class MockWebSocket {
    static instances = [];
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        MockWebSocket.instances.push(this);
    }

    open() {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) {
            this.onopen();
        }
    }

    emitMessage(data) {
        if (this.onmessage) {
            this.onmessage({ data });
        }
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) {
            this.onclose({ wasClean: true, code: 1000, reason: 'closed' });
        }
    }
}

describe('peerSession.js - pure functions', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
        global.WebSocket = MockWebSocket;
        global.WebSocket.OPEN = MockWebSocket.OPEN;
        MockWebSocket.instances = [];
        await disconnect(false);
    });

    describe('ConnectionStatus', () => {
        it('should have correct status values', () => {
            expect(ConnectionStatus.DISCONNECTED).toBe('disconnected');
            expect(ConnectionStatus.IN_ROOM).toBe('in_room');
            expect(ConnectionStatus.CONNECTING).toBe('connecting');
            expect(ConnectionStatus.CONNECTED).toBe('connected');
            expect(ConnectionStatus.ERROR).toBe('error');
        });
    });

    describe('getConnectionStatus', () => {
        it('should return disconnected initially', () => {
            expect(getConnectionStatus()).toBe(ConnectionStatus.DISCONNECTED);
        });
    });

    describe('isConnected', () => {
        it('should return falsy when no connection', () => {
            expect(isConnected()).toBeFalsy();
        });
    });

    describe('getSpouseLikes', () => {
        it('should return empty set when no spouse', () => {
            const likes = getSpouseLikes();
            expect(likes).toBeInstanceOf(Set);
            expect(likes.size).toBe(0);
        });
    });

    describe('getMatches', () => {
        it('should return empty array when no likes', () => {
            getLikes.mockReturnValue([]);
            const matches = getMatches();
            expect(matches).toEqual([]);
        });

        it('should return empty array when no spouse likes', () => {
            getLikes.mockReturnValue(['Emma', 'Olivia']);
            const matches = getMatches();
            expect(matches).toEqual([]);
        });
    });

    describe('hasStoredSession', () => {
        it('should return false when no session stored', () => {
            getSessionTopic.mockReturnValue(null);
            expect(hasStoredSession()).toBe(false);
        });

        it('should return true when session stored', () => {
            getSessionTopic.mockReturnValue('a7x2k9m1');
            expect(hasStoredSession()).toBe(true);
        });
    });

    describe('getCurrentTopic', () => {
        it('should return null when no topic', () => {
            expect(getCurrentTopic()).toBeNull();
        });
    });

    describe('disconnect', () => {
        it('should set status to disconnected when createNew is false', async () => {
            await disconnect(false);
            expect(getConnectionStatus()).toBe(ConnectionStatus.DISCONNECTED);
        });
    });

    describe('joinSession', () => {
        it('should transition to connected after spouse message', async () => {
            const statusChanges = [];
            const connectionChanges = [];

            initPeerSession({
                onMatchFound: vi.fn(),
                onConnectionChange: (connected) => connectionChanges.push(connected),
                onMatchesUpdated: vi.fn(),
                onStatusChange: (status) => statusChanges.push(status)
            });

            const joinPromise = joinSession('room1');
            const ws = MockWebSocket.instances[0];
            ws.open();
            await joinPromise;

            expect(statusChanges).toContain(ConnectionStatus.IN_ROOM);

            const message = JSON.stringify({
                event: 'message',
                topic: 'room1',
                message: JSON.stringify({
                    type: 'likes',
                    likes: [],
                    senderId: 'spouse-id'
                })
            });

            ws.emitMessage(message);

            expect(connectionChanges).toEqual([true]);
            expect(statusChanges[statusChanges.length - 1]).toBe(ConnectionStatus.CONNECTED);
        });
    });

    describe('notify functions', () => {
        it('should not throw when notifying without connection', () => {
            const { notifyLike, notifyUnlike } = require('../peerSession.js');
            expect(() => notifyLike('Emma')).not.toThrow();
            expect(() => notifyUnlike('Emma')).not.toThrow();
        });
    });

    describe('URL Helpers', () => {
        it('should get room code from URL', () => {
            delete window.location;
            window.location = new URL('http://localhost?room=a7x2k9m1');
            
            const { getRoomFromUrl } = require('../peerSession.js');
            expect(getRoomFromUrl()).toBe('a7x2k9m1');
        });

        it('should return null when no room code in URL', () => {
            delete window.location;
            window.location = new URL('http://localhost');
            
            const { getRoomFromUrl } = require('../peerSession.js');
            expect(getRoomFromUrl()).toBeNull();
        });
    });

    describe('Instance ID', () => {
        it('should have getInstanceId available from storage', () => {
            expect(typeof getInstanceId).toBe('function');
        });
    });
});
