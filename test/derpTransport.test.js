import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { createDerpTransport, generateKeypair } from '../derpTransport.js';
import { createFakeDerpHub } from './fakeDerpHub.js';

describe('derpTransport', () => {
    it('completes handshake and relays an encrypted packet', async () => {
        const hub = createFakeDerpHub();
        const aKeys = generateKeypair();
        const bKeys = generateKeypair();
        const a = createDerpTransport({ WebSocketImpl: hub.WebSocketImpl });
        const b = createDerpTransport({ WebSocketImpl: hub.WebSocketImpl });

        const received = new Promise((resolve) => {
            b.onPacket((from, plaintext) => {
                resolve({ from, text: new TextDecoder().decode(plaintext) });
            });
        });

        await a.connect('derp.test', aKeys);
        await b.connect('derp.test', bKeys);
        expect(a.isUp()).toBe(true);
        expect(b.isUp()).toBe(true);

        await a.send(bKeys.publicKey, new TextEncoder().encode('baby-names-probe'));
        const got = await received;
        expect(got.text).toBe('baby-names-probe');
        expect([...got.from]).toEqual([...aKeys.publicKey]);

        a.close();
        b.close();
        expect(a.isUp()).toBe(false);
    });

    it('rejects send before connect', async () => {
        const hub = createFakeDerpHub();
        const transport = createDerpTransport({ WebSocketImpl: hub.WebSocketImpl });
        const peer = nacl.box.keyPair().publicKey;
        await expect(transport.send(peer, new Uint8Array([1]))).rejects.toThrow('not connected');
    });
});
