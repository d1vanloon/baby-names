import { describe, it, expect, beforeEach, vi } from 'vitest';

const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] ?? null),
        setItem: vi.fn((key, value) => { store[key] = value; }),
        removeItem: vi.fn((key) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; })
    };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
    getLastName,
    setLastName,
    getLikes,
    addLike,
    removeLike,
    clearLikes,
    getViewed,
    markViewed,
    clearViewed,
    getPeerId,
    setPeerId,
    getPeerServerConfig,
    setPeerServerConfig,
    getPartnerId,
    setPartnerId,
    clearPartnerId
} from '../storage.js';

describe('storage.js', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    describe('lastName', () => {
        it('should get null when no last name stored', () => {
            expect(getLastName()).toBeNull();
        });

        it('should save and retrieve last name', () => {
            setLastName('Smith');
            expect(getLastName()).toBe('Smith');
        });

        it('should trim whitespace from last name', () => {
            setLastName('  Johnson  ');
            expect(getLastName()).toBe('Johnson');
        });
    });

    describe('likes', () => {
        it('should return empty array when no likes stored', () => {
            expect(getLikes()).toEqual([]);
        });

        it('should add a like', () => {
            addLike('Emma');
            expect(getLikes()).toEqual(['Emma']);
        });

        it('should not add duplicate likes', () => {
            addLike('Emma');
            addLike('Emma');
            expect(getLikes()).toEqual(['Emma']);
        });

        it('should add multiple likes', () => {
            addLike('Emma');
            addLike('Olivia');
            addLike('Ava');
            expect(getLikes()).toEqual(['Emma', 'Olivia', 'Ava']);
        });

        it('should remove a like', () => {
            addLike('Emma');
            addLike('Olivia');
            removeLike('Emma');
            expect(getLikes()).toEqual(['Olivia']);
        });

        it('should clear all likes', () => {
            addLike('Emma');
            addLike('Olivia');
            clearLikes();
            expect(getLikes()).toEqual([]);
        });
    });

    describe('viewed', () => {
        it('should return empty Set when no viewed names', () => {
            const viewed = getViewed();
            expect(viewed).toBeInstanceOf(Set);
            expect(viewed.size).toBe(0);
        });

        it('should mark name as viewed', () => {
            markViewed('Emma');
            const viewed = getViewed();
            expect(viewed.has('Emma')).toBe(true);
        });

        it('should mark multiple names as viewed', () => {
            markViewed('Emma');
            markViewed('Olivia');
            markViewed('Ava');
            const viewed = getViewed();
            expect(viewed.size).toBe(3);
            expect(viewed.has('Emma')).toBe(true);
            expect(viewed.has('Olivia')).toBe(true);
            expect(viewed.has('Ava')).toBe(true);
        });

        it('should clear all viewed names', () => {
            markViewed('Emma');
            markViewed('Olivia');
            clearViewed();
            const viewed = getViewed();
            expect(viewed.size).toBe(0);
        });
    });

    describe('peerId', () => {
        it('should return null when no peer ID stored', () => {
            expect(getPeerId()).toBeNull();
        });

        it('should save and retrieve peer ID', () => {
            setPeerId('abc-123');
            expect(getPeerId()).toBe('abc-123');
        });
    });

    describe('peerServerConfig', () => {
        it('should return default config when none stored', () => {
            const config = getPeerServerConfig();
            expect(config).toEqual({ host: '0.peerjs.com', port: 443 });
        });

        it('should save and retrieve custom host', () => {
            setPeerServerConfig('my-peer-server.com', null);
            const config = getPeerServerConfig();
            expect(config.host).toBe('my-peer-server.com');
            expect(config.port).toBe(443);
        });

        it('should save and retrieve custom port', () => {
            setPeerServerConfig(null, 9000);
            const config = getPeerServerConfig();
            expect(config.host).toBe('0.peerjs.com');
            expect(config.port).toBe(9000);
        });

        it('should save both host and port', () => {
            setPeerServerConfig('custom.com', 8080);
            const config = getPeerServerConfig();
            expect(config).toEqual({ host: 'custom.com', port: 8080 });
        });
    });

    describe('partnerId', () => {
        it('should return null when no partner ID stored', () => {
            expect(getPartnerId()).toBeNull();
        });

        it('should save and retrieve partner ID', () => {
            setPartnerId('partner-abc');
            expect(getPartnerId()).toBe('partner-abc');
        });

        it('should clear partner ID', () => {
            setPartnerId('partner-abc');
            clearPartnerId();
            expect(getPartnerId()).toBeNull();
        });
    });
});
