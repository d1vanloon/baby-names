/**
 * Session modal and connection bar UI management
 */

let elements = null;
let deps = null;

/**
 * Initialize session UI module
 * @param {Object} options
 */
export function initSessionModal(options) {
    deps = {
        onJoinSession: options.onJoinSession,
        onDisconnect: options.onDisconnect,
        onGenerateShareLink: options.onGenerateShareLink,
        getCurrentTopic: options.getCurrentTopic,
        getStoredSessionTopic: options.getStoredSessionTopic,
        isInRoom: options.isInRoom,
        isConnected: options.isConnected
    };

    elements = {
        sessionBtn: options.sessionBtn || document.getElementById('session-btn'),
        sessionModal: options.sessionModal || document.getElementById('session-modal'),
        closeModalBtn: options.closeModalBtn || document.getElementById('close-modal-btn'),
        sessionCode: options.sessionCode || document.getElementById('session-code'),
        copyCodeBtn: options.copyCodeBtn || document.getElementById('copy-code-btn'),
        copyLinkBtn: options.copyLinkBtn || document.getElementById('copy-link-btn'),
        roomCodeInput: options.roomCodeInput || document.getElementById('room-code-input'),
        joinRoomBtn: options.joinRoomBtn || document.getElementById('join-room-btn'),
        sessionStatus: options.sessionStatus || document.getElementById('session-status'),
        sessionStatusIcon: options.sessionStatusIcon || document.getElementById('session-status-icon'),
        sessionStatusText: options.sessionStatusText || document.getElementById('session-status-text'),
        sessionConnected: options.sessionConnected || document.getElementById('session-connected'),
        connectionBar: options.connectionBar || document.getElementById('connection-bar'),
        connectionStatus: options.connectionStatus || document.getElementById('connection-status'),
        disconnectBtn: options.disconnectBtn || document.getElementById('disconnect-btn'),
        modalDisconnectBtn: options.modalDisconnectBtn || document.getElementById('modal-disconnect-btn'),
        sessionResetBtn: options.sessionResetBtn || document.getElementById('session-reset-btn')
    };

    setupEventHandlers();
}

function setupEventHandlers() {
    if (!elements) return;

    elements.sessionBtn.addEventListener('click', showSessionModal);
    elements.closeModalBtn.addEventListener('click', hideSessionModal);
    elements.sessionModal.querySelector('.modal-overlay').addEventListener('click', hideSessionModal);

    elements.copyCodeBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(elements.sessionCode.value);
            elements.copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyCodeBtn.textContent = 'Copy Code';
            }, 2000);
        } catch (err) {
            elements.sessionCode.select();
            document.execCommand('copy');
        }
    });

    elements.copyLinkBtn.addEventListener('click', async () => {
        try {
            const link = await deps.onGenerateShareLink();
            await navigator.clipboard.writeText(link);
            elements.copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyLinkBtn.textContent = 'Copy Link';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
        }
    });

    elements.joinRoomBtn.addEventListener('click', async () => {
        const roomCode = elements.roomCodeInput.value.trim();
        if (!roomCode) return;

        try {
            await deps.onJoinSession(roomCode);
            elements.roomCodeInput.value = '';
            updateSessionModalState();
        } catch (err) {
            console.error('Failed to join room:', err);
            alert('Failed to join room. Please check the code and try again.');
        }
    });

    elements.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.joinRoomBtn.click();
        }
    });

    const disconnectHandlers = [
        elements.disconnectBtn,
        elements.modalDisconnectBtn,
        elements.sessionResetBtn
    ].filter(Boolean);

    for (const button of disconnectHandlers) {
        button.addEventListener('click', async () => {
            await deps.onDisconnect();
            updateSessionModalState();
        });
    }
}

export function showSessionModal() {
    if (!elements) return;
    elements.sessionModal.classList.remove('hidden');
    updateSessionModalState();
}

export function hideSessionModal() {
    if (!elements) return;
    elements.sessionModal.classList.add('hidden');
}

export function updateSessionModalState() {
    if (!elements || !deps) return;

    const topic = deps.getCurrentTopic() || deps.getStoredSessionTopic();
    elements.sessionCode.value = topic || '';

    const connected = deps.isConnected();
    elements.sessionConnected.classList.toggle('hidden', !connected);
}

export function handleConnectionChange(connected) {
    if (!elements) return;

    elements.connectionBar.classList.toggle('hidden', !connected);

    if (connected) {
        elements.connectionStatus.textContent = '🔗 Connected with spouse';
    }

    if (!elements.sessionModal.classList.contains('hidden')) {
        updateSessionModalState();
    }
}

export function handleStatusChange(status, message) {
    if (!elements) return;

    const statusEl = elements.sessionStatus;
    const iconEl = elements.sessionStatusIcon;
    const textEl = elements.sessionStatusText;

    statusEl.classList.remove('status-loading', 'status-connected', 'status-error');

    switch (status) {
        case 'CONNECTING':
            statusEl.classList.add('status-loading');
            iconEl.textContent = '⏳';
            textEl.textContent = message || 'Connecting...';
            break;
        case 'IN_ROOM':
            iconEl.textContent = '📡';
            textEl.textContent = message || 'Ready to connect, waiting for spouse...';
            break;
        case 'CONNECTED':
            statusEl.classList.add('status-connected');
            iconEl.textContent = '✅';
            textEl.textContent = message || 'Connected to spouse!';
            updateSessionModalState();
            break;
        case 'ERROR':
            statusEl.classList.add('status-error');
            iconEl.textContent = '❌';
            textEl.textContent = message || 'Connection error';
            break;
        case 'DISCONNECTED':
        default:
            iconEl.textContent = '📴';
            textEl.textContent = message || 'Enter a code to connect or start a new connection';
            updateSessionModalState();
            break;
    }
}
