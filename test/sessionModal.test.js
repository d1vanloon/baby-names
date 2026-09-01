import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
    initSessionModal,
    showSessionModal,
    hideSessionModal,
    updateSessionModalState,
    setShareToken,
    handleConnectionChange,
    handleStatusChange
} from '../sessionModal.js';

describe('sessionModal.js', () => {
    let deps;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="session-btn"></button>
            <div id="connection-bar" class="hidden"></div>
            <span id="connection-status"></span>
            <button id="disconnect-btn"></button>

            <div id="session-modal" class="modal hidden">
                <div class="modal-overlay"></div>
                <button id="close-modal-btn"></button>
                <input id="session-code" />
                <button id="copy-code-btn"></button>
                <button id="copy-link-btn"></button>
                <input id="room-code-input" />
                <button id="join-room-btn"></button>
                <div id="session-status" class="session-status">
                    <span id="session-status-icon"></span>
                    <span id="session-status-text"></span>
                </div>
                <div id="session-connected" class="hidden"></div>
                <button id="modal-disconnect-btn"></button>
                <button id="session-reset-btn"></button>
            </div>
        `;

        deps = {
            onJoinSession: vi.fn(() => Promise.resolve()),
            onDisconnect: vi.fn(() => Promise.resolve()),
            onGenerateShareLink: vi.fn(async () => {
                setShareToken('bn1.testtoken.host');
                return 'https://example.com/?pair=bn1.testtoken.host';
            })
        };

        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(() => Promise.resolve())
            }
        });

        initSessionModal(deps);
    });

    it('shows and hides modal', () => {
        showSessionModal();
        expect(document.getElementById('session-modal').classList.contains('hidden')).toBe(false);

        hideSessionModal();
        expect(document.getElementById('session-modal').classList.contains('hidden')).toBe(true);
    });

    it('updates code and connected state', () => {
        setShareToken('bn1.testtoken.host');
        handleConnectionChange(true);
        updateSessionModalState();
        expect(document.getElementById('session-code').value).toBe('bn1.testtoken.host');
        expect(document.getElementById('session-connected').classList.contains('hidden')).toBe(false);
    });

    it('handles room join action', async () => {
        const input = document.getElementById('room-code-input');
        input.value = 'z9y8x7w6';

        document.getElementById('join-room-btn').click();
        await Promise.resolve();

        expect(deps.onJoinSession).toHaveBeenCalledWith('z9y8x7w6');
    });

    it('updates connection bar visibility', () => {
        handleConnectionChange(true);
        expect(document.getElementById('connection-bar').classList.contains('hidden')).toBe(false);

        handleConnectionChange(false);
        expect(document.getElementById('connection-bar').classList.contains('hidden')).toBe(true);
    });

    it('renders status message', () => {
        handleStatusChange('ERROR', 'Connection error');
        expect(document.getElementById('session-status-text').textContent).toBe('Connection error');
        expect(document.getElementById('session-status').classList.contains('status-error')).toBe(true);
    });
});
