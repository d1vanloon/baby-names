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
    getSessionTopic,
    setSessionTopic,
    clearSessionTopic,
    getPartnerLikes,
    setPartnerLikes,
    clearPartnerLikes,
    getInstanceId
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

    describe('sessionTopic', () => {
        it('should return null when no session topic stored', () => {
            expect(getSessionTopic()).toBeNull();
        });

        it('should save and retrieve session topic', () => {
            setSessionTopic('a7x2k9m1');
            expect(getSessionTopic()).toBe('a7x2k9m1');
        });

        it('should clear session topic', () => {
            setSessionTopic('a7x2k9m1');
            clearSessionTopic();
            expect(getSessionTopic()).toBeNull();
        });
    });

    describe('partnerLikes', () => {
        it('should return empty Set when no partner likes are stored', () => {
            const likes = getPartnerLikes();
            expect(likes).toBeInstanceOf(Set);
            expect(likes.size).toBe(0);
        });

        it('should save and retrieve partner likes', () => {
            setPartnerLikes(['Emma', 'Olivia']);
            const likes = getPartnerLikes();
            expect(likes.has('Emma')).toBe(true);
            expect(likes.has('Olivia')).toBe(true);
            expect(likes.size).toBe(2);
        });

        it('should clear partner likes', () => {
            setPartnerLikes(['Emma']);
            clearPartnerLikes();
            const likes = getPartnerLikes();
            expect(likes.size).toBe(0);
        });
    });

    describe('instanceId', () => {
        it('should generate a UUID when no instance ID stored', () => {
            const id = getInstanceId();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('should return same ID on subsequent calls', () => {
            const id1 = getInstanceId();
            const id2 = getInstanceId();
            expect(id1).toBe(id2);
        });

        it('should return different ID after storage is cleared', () => {
            const id1 = getInstanceId();
            localStorageMock.clear();
            const id2 = getInstanceId();
            expect(id1).not.toBe(id2);
        });
    });
});
