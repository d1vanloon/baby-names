import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state, storageMocks } = vi.hoisted(() => {
    const hoistedState = {
        likes: ['Emma', 'Ava'],
        instanceId: 'instance-1',
        partnerLikes: []
    };

    const mocks = {
        getLikes: vi.fn(() => [...hoistedState.likes]),
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

import { createSessionSync } from '../sessionSync.js';

describe('sessionSync.js', () => {
    let config;
    let sync;

    beforeEach(() => {
        state.likes = ['Emma', 'Ava'];
        state.instanceId = 'instance-1';
        state.partnerLikes = [];
        vi.clearAllMocks();

        config = {
            publishMessage: vi.fn(() => Promise.resolve()),
            onMatchFound: vi.fn(),
            onConnectionChange: vi.fn(),
            onMatchesUpdated: vi.fn(),
            onConnected: vi.fn(),
            isInRoom: vi.fn(() => true)
        };

        sync = createSessionSync(config);
        sync.initializeFromStorage();
    });

    it('batches local likes into a single publish', async () => {
        sync.notifyLike('Olivia');
        sync.notifyLike('Noah');

        await new Promise((resolve) => setTimeout(resolve, 450));

        expect(config.publishMessage).toHaveBeenCalledWith('likes_batch', {
            likes: expect.arrayContaining(['Olivia', 'Noah']),
            likeVersion: 1
        });
    });

    it('updates matches from incoming snapshot', async () => {
        await sync.handleMessage({
            type: 'state_snapshot',
            senderId: 'instance-2',
            payload: {
                likes: ['Emma'],
                likeVersion: 1
            }
        });

        expect(config.onConnectionChange).toHaveBeenCalledWith(true);
        expect(config.onConnected).toHaveBeenCalled();
        expect(sync.getMatches()).toContain('Emma');
    });
});
