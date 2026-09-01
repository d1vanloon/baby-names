import nacl from 'tweetnacl';

const FRAME_HEADER = 5;
const FRAME_SERVER_KEY = 1;
const FRAME_CLIENT_INFO = 2;
const FRAME_SERVER_INFO = 3;
const FRAME_SEND_PACKET = 4;
const FRAME_RECV_PACKET = 5;
const FRAME_KEEP_ALIVE = 6;
const DERP_MAGIC = new TextEncoder().encode('DERP🔑');
const CLIENT_INFO = new TextEncoder().encode(JSON.stringify({ version: 2 }));

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

function readFrame(buf) {
    if (buf.length < FRAME_HEADER) {
        return null;
    }
    const type = buf[0];
    const size = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(1);
    if (buf.length < FRAME_HEADER + size) {
        return null;
    }
    return {
        type,
        size,
        data: buf.subarray(FRAME_HEADER, FRAME_HEADER + size),
        rest: buf.subarray(FRAME_HEADER + size)
    };
}

function encodeFrame(type, payload) {
    const frame = new Uint8Array(FRAME_HEADER + payload.length);
    frame[0] = type;
    new DataView(frame.buffer).setUint32(1, payload.length);
    frame.set(payload, FRAME_HEADER);
    return frame;
}

function bytesEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function asBytes(value) {
    return new Uint8Array(value);
}

/**
 * Thin DERP-over-WebSocket client. Callers pass hostnames and keypairs.
 * Frames, nacl boxes, and sockets stay inside this module.
 *
 * @param {{ WebSocketImpl?: typeof WebSocket }} [opts]
 * @returns {import('./derpTransport.js').DerpTransport}
 */
export function createDerpTransport(opts = {}) {
    const WebSocketImpl = opts.WebSocketImpl || globalThis.WebSocket;
    let socket = null;
    let pending = new Uint8Array(0);
    let stage = 'idle';
    let serverPublicKey = null;
    let keypair = null;
    let packetHandler = null;
    let generation = 0;

    function isUp() {
        return stage === 'ready' && socket && socket.readyState === WebSocketImpl.OPEN;
    }

    function close() {
        generation += 1;
        stage = 'idle';
        serverPublicKey = null;
        if (socket) {
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null;
            try {
                socket.close();
            } catch {
                // already closed
            }
            socket = null;
        }
        pending = new Uint8Array(0);
    }

    function handleReadyFrame(frame) {
        if (frame.type === FRAME_KEEP_ALIVE) {
            return;
        }
        if (frame.type !== FRAME_RECV_PACKET) {
            return;
        }
        if (frame.data.length < nacl.box.publicKeyLength + nacl.secretbox.nonceLength + nacl.secretbox.overheadLength) {
            return;
        }
        const from = asBytes(frame.data.subarray(0, nacl.box.publicKeyLength));
        const nonce = asBytes(frame.data.subarray(
            nacl.box.publicKeyLength,
            nacl.box.publicKeyLength + nacl.secretbox.nonceLength
        ));
        const boxed = asBytes(frame.data.subarray(nacl.box.publicKeyLength + nacl.secretbox.nonceLength));
        const shared = nacl.box.before(from, asBytes(keypair.secretKey));
        const plaintext = nacl.secretbox.open(boxed, nonce, shared);
        if (!plaintext || !packetHandler) {
            return;
        }
        packetHandler(new Uint8Array(from), plaintext);
    }

    function consumeMessage(data) {
        pending = concatBytes([pending, data]);
        while (true) {
            const frame = readFrame(pending);
            if (!frame) {
                return;
            }
            pending = frame.rest;

            if (stage === 'server-key') {
                if (frame.type !== FRAME_SERVER_KEY || frame.data.length < DERP_MAGIC.length + nacl.box.publicKeyLength) {
                    close();
                    throw new Error('bad ServerKey frame');
                }
                if (!bytesEqual(frame.data.subarray(0, DERP_MAGIC.length), DERP_MAGIC)) {
                    close();
                    throw new Error('bad DERP magic');
                }
                serverPublicKey = asBytes(frame.data.subarray(
                    DERP_MAGIC.length,
                    DERP_MAGIC.length + nacl.box.publicKeyLength
                ));
                const nonce = nacl.randomBytes(nacl.box.nonceLength);
                const boxed = nacl.box(
                    asBytes(CLIENT_INFO),
                    nonce,
                    serverPublicKey,
                    asBytes(keypair.secretKey)
                );
                const payload = new Uint8Array(
                    nacl.box.publicKeyLength + nacl.box.nonceLength + boxed.length
                );
                payload.set(keypair.publicKey, 0);
                payload.set(nonce, nacl.box.publicKeyLength);
                payload.set(boxed, nacl.box.publicKeyLength + nacl.box.nonceLength);
                stage = 'server-info';
                socket.send(encodeFrame(FRAME_CLIENT_INFO, payload));
                continue;
            }

            if (stage === 'server-info') {
                if (frame.type !== FRAME_SERVER_INFO) {
                    close();
                    throw new Error('bad ServerInfo frame');
                }
                const nonce = asBytes(frame.data.subarray(0, nacl.box.nonceLength));
                const boxed = asBytes(frame.data.subarray(nacl.box.nonceLength));
                const opened = nacl.box.open(boxed, nonce, serverPublicKey, asBytes(keypair.secretKey));
                if (!opened) {
                    close();
                    throw new Error('could not decrypt ServerInfo');
                }
                stage = 'ready';
                continue;
            }

            if (stage === 'ready') {
                handleReadyFrame(frame);
            }
        }
    }

    return {
        async connect(host, nextKeypair) {
            close();
            const gen = generation;
            keypair = {
                publicKey: asBytes(nextKeypair.publicKey),
                secretKey: asBytes(nextKeypair.secretKey)
            };
            stage = 'connecting';
            const url = `wss://${host}/derp`;

            await new Promise((resolve, reject) => {
                const ws = new WebSocketImpl(url, 'derp');
                socket = ws;
                ws.binaryType = 'arraybuffer';
                let settled = false;

                const fail = (err) => {
                    if (generation !== gen || settled) {
                        return;
                    }
                    settled = true;
                    close();
                    reject(err);
                };

                ws.onerror = () => fail(new Error(`DERP websocket error for ${host}`));
                ws.onclose = () => {
                    if (stage !== 'ready') {
                        fail(new Error(`DERP closed during ${stage}`));
                    } else {
                        stage = 'idle';
                    }
                };
                ws.onopen = () => {
                    if (generation !== gen) {
                        return;
                    }
                    stage = 'server-key';
                };
                ws.onmessage = (event) => {
                    if (generation !== gen) {
                        return;
                    }
                    try {
                        consumeMessage(event.data);
                        if (stage === 'ready' && !settled) {
                            settled = true;
                            ws.onclose = () => {
                                stage = 'idle';
                            };
                            resolve();
                        }
                    } catch (err) {
                        fail(err);
                    }
                };
            });
        },

        async send(peerPub, plaintext) {
            if (!isUp()) {
                throw new Error('DERP transport is not connected');
            }
            const shared = nacl.box.before(asBytes(peerPub), asBytes(keypair.secretKey));
            const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
            const boxed = nacl.secretbox(asBytes(plaintext), nonce, shared);
            const payload = new Uint8Array(
                nacl.box.publicKeyLength + nacl.secretbox.nonceLength + boxed.length
            );
            payload.set(asBytes(peerPub), 0);
            payload.set(nonce, nacl.box.publicKeyLength);
            payload.set(boxed, nacl.box.publicKeyLength + nacl.secretbox.nonceLength);
            socket.send(encodeFrame(FRAME_SEND_PACKET, payload));
        },

        onPacket(handler) {
            packetHandler = handler;
        },

        close,

        isUp
    };
}

export function generateKeypair() {
    return nacl.box.keyPair();
}

export {
    FRAME_SERVER_KEY,
    FRAME_CLIENT_INFO,
    FRAME_SERVER_INFO,
    FRAME_SEND_PACKET,
    FRAME_RECV_PACKET,
    FRAME_KEEP_ALIVE,
    DERP_MAGIC,
    encodeFrame,
    readFrame
};
