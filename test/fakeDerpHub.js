import nacl from 'tweetnacl';
import {
    FRAME_SERVER_KEY,
    FRAME_CLIENT_INFO,
    FRAME_SERVER_INFO,
    FRAME_SEND_PACKET,
    FRAME_RECV_PACKET,
    DERP_MAGIC,
    encodeFrame,
    readFrame
} from '../derpTransport.js';

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

function concatBytes(chunks) {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
    }
    return out;
}

/**
 * In-memory DERP relay for tests. Speaks the same handshake and packet frames
 * as a public DERP node, then routes SendPacket to the connected dest key.
 */
export function createFakeDerpHub() {
    const serverKey = nacl.box.keyPair();
    const byPub = new Map();

    function pubHex(bytes) {
        return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    class FakeWebSocket {
        constructor(url, protocol) {
            this.url = url;
            this.protocol = protocol;
            this.binaryType = 'arraybuffer';
            this.readyState = 0;
            this.onopen = null;
            this.onmessage = null;
            this.onerror = null;
            this.onclose = null;
            this._pending = new Uint8Array(0);
            this._clientPub = null;
            queueMicrotask(() => this._open());
        }

        _open() {
            this.readyState = OPEN;
            if (this.onopen) {
                this.onopen();
            }
            const payload = new Uint8Array(DERP_MAGIC.length + nacl.box.publicKeyLength);
            payload.set(DERP_MAGIC, 0);
            payload.set(serverKey.publicKey, DERP_MAGIC.length);
            this._emit(encodeFrame(FRAME_SERVER_KEY, payload));
        }

        _emit(bytes) {
            if (this.readyState !== OPEN || !this.onmessage) {
                return;
            }
            this.onmessage({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
        }

        send(data) {
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            this._pending = concatBytes([this._pending, bytes]);
            while (true) {
                const frame = readFrame(this._pending);
                if (!frame) {
                    return;
                }
                this._pending = frame.rest;
                this._onFrame(frame);
            }
        }

        _onFrame(frame) {
            if (frame.type === FRAME_CLIENT_INFO) {
                const clientPub = new Uint8Array(frame.data.subarray(0, nacl.box.publicKeyLength));
                const nonce = new Uint8Array(frame.data.subarray(
                    nacl.box.publicKeyLength,
                    nacl.box.publicKeyLength + nacl.box.nonceLength
                ));
                const boxed = new Uint8Array(frame.data.subarray(nacl.box.publicKeyLength + nacl.box.nonceLength));
                const opened = nacl.box.open(boxed, nonce, clientPub, serverKey.secretKey);
                if (!opened) {
                    this.close();
                    return;
                }
                this._clientPub = new Uint8Array(clientPub);
                byPub.set(pubHex(this._clientPub), this);
                const info = new Uint8Array(
                    new TextEncoder().encode(JSON.stringify({ version: 2 }))
                );
                const replyNonce = nacl.randomBytes(nacl.box.nonceLength);
                const replyBox = nacl.box(info, replyNonce, this._clientPub, serverKey.secretKey);
                const payload = new Uint8Array(nacl.box.nonceLength + replyBox.length);
                payload.set(replyNonce, 0);
                payload.set(replyBox, nacl.box.nonceLength);
                this._emit(encodeFrame(FRAME_SERVER_INFO, payload));
                return;
            }

            if (frame.type === FRAME_SEND_PACKET && this._clientPub) {
                const dest = frame.data.subarray(0, nacl.box.publicKeyLength);
                const packet = frame.data.subarray(nacl.box.publicKeyLength);
                const target = byPub.get(pubHex(dest));
                if (!target) {
                    return;
                }
                const forwarded = new Uint8Array(this._clientPub.length + packet.length);
                forwarded.set(this._clientPub, 0);
                forwarded.set(packet, this._clientPub.length);
                target._emit(encodeFrame(FRAME_RECV_PACKET, forwarded));
            }
        }

        close() {
            if (this.readyState === CLOSED || this.readyState === CLOSING) {
                return;
            }
            this.readyState = CLOSED;
            if (this._clientPub) {
                byPub.delete(pubHex(this._clientPub));
            }
            if (this.onclose) {
                this.onclose({ code: 1000, reason: '' });
            }
        }
    }

    FakeWebSocket.OPEN = OPEN;
    FakeWebSocket.CLOSING = CLOSING;
    FakeWebSocket.CLOSED = CLOSED;

    return { WebSocketImpl: FakeWebSocket };
}
