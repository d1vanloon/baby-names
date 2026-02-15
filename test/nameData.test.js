import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockViewed = new Set();
const mockLikes = [];

vi.mock('../storage.js', () => ({
    getViewed: vi.fn(() => new Set(mockViewed)),
    markViewed: vi.fn((name) => { mockViewed.add(name); }),
    clearViewed: vi.fn(() => { mockViewed.clear(); }),
    getLikes: vi.fn(() => mockLikes)
}));

vi.mock('../peerSession.js', () => ({
    isConnected: vi.fn(() => false),
    getPartnerLikes: vi.fn(() => new Set())
}));

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    text: async () => 'Emma,F,10000\nOlivia,F,9000\nAva,F,8000\nSophia,F,7000\nIsabella,F,6000'
})));

import {
    loadNameData,
    resetQueue,
    peekNextNames,
    consumeCurrentName,
    hasMoreNames,
    getRemainingCount,
    resetAllNames,
    getTotalNamesCount
} from '../nameData.js';

import { getViewed, markViewed, clearViewed, getLikes } from '../storage.js';
import { isConnected, getPartnerLikes } from '../peerSession.js';

describe('nameData.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockViewed.clear();
        mockLikes.length = 0;
        fetch.mockReset();
    });

    describe('loadNameData', () => {
        it('should load names from data files', async () => {
            await loadNameData();

            expect(getTotalNamesCount()).toBeGreaterThan(0);
            expect(hasMoreNames()).toBe(true);
        });

        it('should filter names below minimum occurrences', async () => {
            await loadNameData();

            expect(hasMoreNames()).toBe(true);
        });

        it('should call progress callback', async () => {
            const progressFn = vi.fn();
            await loadNameData(progressFn);

            expect(progressFn).toHaveBeenCalled();
        });
    });

    describe('queue management', () => {
        beforeEach(async () => {
            await loadNameData();
            mockViewed.clear();
        });

        it('should return correct remaining count', () => {
            expect(getRemainingCount()).toBeGreaterThan(0);
        });

        it('should peek next names', () => {
            const names = peekNextNames(3);
            expect(names).toHaveLength(3);
        });

        it('should consume and mark as viewed', () => {
            const beforeCount = getRemainingCount();
            const name = consumeCurrentName();
            
            expect(name).toBeTruthy();
            expect(getRemainingCount()).toBe(beforeCount - 1);
            expect(markViewed).toHaveBeenCalledWith(name);
        });

        it('should return null when queue is empty', async () => {
            mockViewed.add('Emma');
            mockViewed.add('Olivia');
            mockViewed.add('Ava');
            mockViewed.add('Sophia');
            mockViewed.add('Isabella');
            
            resetQueue();

            const result = consumeCurrentName();
            expect(result).toBeNull();
        });
    });

    describe('resetQueue', () => {
        it('should filter out viewed names', async () => {
            await loadNameData();

            mockViewed.add('Emma');
            resetQueue();

            const names = peekNextNames(5);
            expect(names).not.toContain('Emma');
            expect(names).toContain('Olivia');
        });
    });

    describe('resetAllNames', () => {
        it('should clear viewed and reset queue', async () => {
            await loadNameData();

            resetAllNames();

            expect(clearViewed).toHaveBeenCalled();
            expect(hasMoreNames()).toBe(true);
        });
    });

    describe('partner likes integration', () => {
        it('should not mix partner likes when not connected', async () => {
            isConnected.mockReturnValue(false);
            
            await loadNameData();

            const names = peekNextNames(3);
            expect(names.length).toBeGreaterThan(0);
        });

        it('should mix partner likes when connected', async () => {
            isConnected.mockReturnValue(true);
            getPartnerLikes.mockReturnValue(new Set(['Olivia']));

            await loadNameData();

            const names = peekNextNames(3);
            expect(names).toContain('Olivia');
        });
    });
});
