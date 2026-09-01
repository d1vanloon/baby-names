import { describe, it, expect, beforeEach, vi } from 'vitest';
import nacl from 'tweetnacl';
import { createDerpTransport } from '../derpTransport.js';
import {
    createPartnerSession,
    encodePairingToken,
    decodePairingToken,
    acceptPeer
} from '../partnerSession.js';
import { createFakeDerpHub } from './fakeDerpHub.js';

function memoryStore(instanceId) {
    let likes = [];
    let partner = [];
    let pairing = null;
    return {
        addLike(name) {
            if (!likes.includes(name)) {
                likes.push(name);
            }
        },
        removeLike(name) {
            likes = likes.filter((item) => item !== name);
        },
        getLikes() {
            return [...likes];
        },
        getPartnerLikes() {
            return new Set(partner);
        },
        setPartnerLikes(next) {
            partner = [...next];
        },
        clearPartnerLikes() {
            partner = [];
        },
        getInstanceId() {
            return instanceId;
        },
        getPairingToken() {
            return pairing;
        },
        setPairingToken(value) {
            pairing = value;
        },
        clearPairingToken() {
            pairing = null;
        }
    };
}

describe('pairing token', () => {
    it('round-trips public key and host', () => {
        const { publicKey } = nacl.box.keyPair();
        const token = encodePairingToken(publicKey, 'derp12d.tailscale.com');
        const parsed = decodePairingToken(token);
        expect(parsed.host).toBe('derp12d.tailscale.com');
        expect([...parsed.publicKey]).toEqual([...publicKey]);
    });

    it('rejects junk', () => {
        expect(decodePairingToken('room1234')).toBeNull();
        expect(decodePairingToken('bn1.not-valid')).toBeNull();
    });

    it('rejects hosts with path, query, or fragment characters', () => {
        const { publicKey } = nacl.box.keyPair();
        for (const host of ['evil.com/foo', 'host?x=1', 'host#frag', 'host name']) {
            expect(decodePairingToken(encodePairingToken(publicKey, host))).toBeNull();
        }
    });
});

describe('acceptPeer', () => {
    it('binds the first peer and ignores a third', () => {
        const first = acceptPeer(null, 'aaa');
        expect(first).toEqual({ peerB64: 'aaa', accepted: true });
        expect(acceptPeer('aaa', 'aaa').accepted).toBe(true);
        expect(acceptPeer('aaa', 'bbb')).toEqual({ peerB64: 'aaa', accepted: false });
    });
});

describe('createPartnerSession', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    function makeSession(hub, instanceId, store) {
        return createPartnerSession({
            createTransport: () => createDerpTransport({ WebSocketImpl: hub.WebSocketImpl }),
            defaultHost: 'derp.test',
            debounceMs: 20,
            store
        });
    }

    it('pairs two sessions and celebrates a local completing like', async () => {
        const hub = createFakeDerpHub();
        const hostStore = memoryStore('host-id');
        const guestStore = memoryStore('guest-id');
        const host = makeSession(hub, 'host-id', hostStore);
        const guest = makeSession(hub, 'guest-id', guestStore);
        const celebrated = [];
        let hostStatus = 'idle';
        let guestStatus = 'idle';

        host.subscribe({
            onStatus(status) {
                hostStatus = status;
            }
        });
        guest.subscribe({
            onStatus(status) {
                guestStatus = status;
            },
            onMatch(name) {
                celebrated.push(name);
            }
        });

        const token = await host.host();
        expect(host.hasStoredPairing).toBe(true);
        await guest.join(token);

        const deadline = Date.now() + 2000;
        while ((hostStatus !== 'paired' || guestStatus !== 'paired') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(hostStatus).toBe('paired');
        expect(guestStatus).toBe('paired');

        host.like('Emma');
        await new Promise((resolve) => setTimeout(resolve, 80));
        guest.like('Emma');
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(celebrated).toEqual(['Emma']);
        expect(guest.matches()).toEqual(['Emma']);
        expect(host.matches()).toEqual(['Emma']);
    });

    it('refreshes local matches after unlike', () => {
        const store = memoryStore('solo');
        store.addLike('Emma');
        store.setPartnerLikes(['Emma']);
        const session = createPartnerSession({
            createTransport: () => createDerpTransport({
                WebSocketImpl: createFakeDerpHub().WebSocketImpl
            }),
            store
        });
        session.subscribe({});
        expect(session.matches()).toEqual(['Emma']);
        store.removeLike('Emma');
        expect(session.matches()).toEqual([]);
    });
});
