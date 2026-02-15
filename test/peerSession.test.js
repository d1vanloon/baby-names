import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage.js', () => ({
    getLikes: vi.fn(() => []),
    getPeerServerConfig: vi.fn(() => ({ host: '0.peerjs.com', port: 443 })),
    setPeerId: vi.fn(),
    getPeerId: vi.fn(() => null),
    getPartnerId: vi.fn(() => null),
    setPartnerId: vi.fn(),
    clearPartnerId: vi.fn()
}));

import {
    getConnectionStatus,
    getMatches,
    getPartnerLikes,
    isConnected,
    hasStoredPartner,
    getCurrentPeerId,
    ConnectionStatus,
    disconnect
} from '../peerSession.js';

import { getLikes, getPartnerId } from '../storage.js';

describe('peerSession.js - pure functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        disconnect();
    });

    describe('ConnectionStatus', () => {
        it('should have correct status values', () => {
            expect(ConnectionStatus.DISCONNECTED).toBe('disconnected');
            expect(ConnectionStatus.INITIALIZING).toBe('initializing');
            expect(ConnectionStatus.WAITING).toBe('waiting');
            expect(ConnectionStatus.CONNECTING).toBe('connecting');
            expect(ConnectionStatus.CONNECTED).toBe('connected');
            expect(ConnectionStatus.RECONNECTING).toBe('reconnecting');
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

    describe('getPartnerLikes', () => {
        it('should return empty set when no partner', () => {
            const likes = getPartnerLikes();
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

        it('should return empty array when no partner likes', () => {
            getLikes.mockReturnValue(['Emma', 'Olivia']);
            const matches = getMatches();
            expect(matches).toEqual([]);
        });
    });

    describe('hasStoredPartner', () => {
        it('should return false when no partner stored', () => {
            getPartnerId.mockReturnValue(null);
            expect(hasStoredPartner()).toBe(false);
        });

        it('should return true when partner stored', () => {
            getPartnerId.mockReturnValue('partner-123');
            expect(hasStoredPartner()).toBe(true);
        });
    });

    describe('getCurrentPeerId', () => {
        it('should return null when no peer', () => {
            expect(getCurrentPeerId()).toBeNull();
        });
    });

    describe('disconnect', () => {
        it('should set status to disconnected', () => {
            disconnect();
            expect(getConnectionStatus()).toBe(ConnectionStatus.DISCONNECTED);
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
        it('should get join ID from URL', () => {
            delete window.location;
            window.location = new URL('http://localhost?join=partner-123');
            
            const { getJoinIdFromUrl } = require('../peerSession.js');
            expect(getJoinIdFromUrl()).toBe('partner-123');
        });

        it('should return null when no join ID in URL', () => {
            delete window.location;
            window.location = new URL('http://localhost');
            
            const { getJoinIdFromUrl } = require('../peerSession.js');
            expect(getJoinIdFromUrl()).toBeNull();
        });
    });
});
