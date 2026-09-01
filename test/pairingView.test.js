import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPairingView, normalizePairToken } from '../pairingView.js';

describe('normalizePairToken', () => {
    it('reads pair from a share URL', () => {
        expect(normalizePairToken('https://example.com/?pair=bn1.abc.host')).toBe('bn1.abc.host');
    });

    it('returns a pasted token', () => {
        expect(normalizePairToken('  bn1.abc.host  ')).toBe('bn1.abc.host');
    });
});

describe('createPairingView', () => {
    let deps;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="session-btn"></button>
            <button id="matches-btn" class="hidden"></button>
            <div id="connection-bar" class="hidden"></div>
            <div id="pairing-sheet" class="hidden">
                <div class="pairing-overlay"></div>
                <button id="pairing-close"></button>
                <div id="pairing-idle"></div>
                <div id="pairing-connecting" class="hidden">
                    <p id="pairing-connecting-text"></p>
                    <button id="pairing-copy-again" class="hidden"></button>
                    <button id="pairing-cancel"></button>
                </div>
                <div id="pairing-paired" class="hidden">
                    <button id="pairing-disconnect"></button>
                </div>
                <div id="pairing-error" class="hidden">
                    <p id="pairing-error-text"></p>
                    <button id="pairing-retry"></button>
                </div>
                <button id="pairing-copy-link"></button>
                <input id="pairing-join-input" />
                <button id="pairing-join-btn"></button>
            </div>
        `;

        deps = {
            host: vi.fn(async () => 'bn1.test.host'),
            join: vi.fn(async () => {}),
            disconnect: vi.fn(async () => {}),
            makeShareUrl: (token) => `https://example.com/?pair=${token}`
        };

        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(() => Promise.resolve())
            }
        });
    });

    it('shows only the idle panel at start', () => {
        createPairingView(deps);
        expect(document.getElementById('pairing-idle').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('pairing-connecting').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('pairing-paired').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('pairing-error').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('connection-bar').classList.contains('hidden')).toBe(true);
    });

    it('hides share and join while connecting', () => {
        const view = createPairingView(deps);
        view.open();
        view.accept({ type: 'status', status: 'connecting', message: 'Waiting' });
        expect(document.getElementById('pairing-idle').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('pairing-connecting').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('pairing-paired').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('pairing-connecting-text').textContent).toBe('Waiting');
    });

    it('shows the bar only when paired', () => {
        const view = createPairingView(deps);
        view.accept({ type: 'status', status: 'paired', message: 'Connected' });
        expect(document.getElementById('pairing-paired').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('pairing-idle').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('connection-bar').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('matches-btn').classList.contains('hidden')).toBe(false);
    });

    it('joins from a pasted URL', async () => {
        const view = createPairingView(deps);
        document.getElementById('pairing-join-input').value = 'https://example.com/?pair=bn1.abc.host';
        document.getElementById('pairing-join-btn').click();
        await Promise.resolve();
        expect(deps.join).toHaveBeenCalledWith('bn1.abc.host');
        void view;
    });

    it('does not show copy-again while joining', async () => {
        const view = createPairingView(deps);
        document.getElementById('pairing-join-input').value = 'bn1.abc.host';
        document.getElementById('pairing-join-btn').click();
        await Promise.resolve();
        view.accept({ type: 'status', status: 'connecting', message: 'Joining partner' });
        expect(document.getElementById('pairing-copy-again').classList.contains('hidden')).toBe(true);
    });

    it('renders an error without keeping the idle panel', () => {
        const view = createPairingView(deps);
        view.accept({ type: 'status', status: 'error', message: 'Invalid pairing link' });
        expect(document.getElementById('pairing-error').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('pairing-idle').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('pairing-error-text').textContent).toBe('Invalid pairing link');
    });
});
