/**
 * Exclusive pairing chrome. Maps idle | connecting | paired | error to one panel.
 */

/**
 * Accept a pasted token or a full share URL.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePairToken(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
        return '';
    }
    try {
        const url = new URL(trimmed);
        const fromQuery = url.searchParams.get('pair');
        if (fromQuery) {
            return fromQuery.trim();
        }
    } catch {
        // pasted opaque token
    }
    return trimmed;
}

/**
 * @param {{
 *   host: () => Promise<string>,
 *   join: (token: string) => Promise<void>,
 *   disconnect: () => Promise<void>,
 *   makeShareUrl: (token: string) => string
 * }} options
 * @returns {{
 *   open: () => void,
 *   join: (raw: string) => Promise<void>,
 *   accept: (event: { type: 'status', status: string, message?: string }) => void
 * }}
 */
export function createPairingView(options) {
    const root = document.getElementById('pairing-sheet');
    const overlay = root.querySelector('.pairing-overlay');
    const idlePanel = document.getElementById('pairing-idle');
    const connectingPanel = document.getElementById('pairing-connecting');
    const pairedPanel = document.getElementById('pairing-paired');
    const errorPanel = document.getElementById('pairing-error');
    const connectingText = document.getElementById('pairing-connecting-text');
    const errorText = document.getElementById('pairing-error-text');
    const copyBtn = document.getElementById('pairing-copy-link');
    const copyAgainBtn = document.getElementById('pairing-copy-again');
    const joinInput = document.getElementById('pairing-join-input');
    const joinBtn = document.getElementById('pairing-join-btn');
    const cancelBtn = document.getElementById('pairing-cancel');
    const disconnectBtn = document.getElementById('pairing-disconnect');
    const retryBtn = document.getElementById('pairing-retry');
    const openBtn = document.getElementById('session-btn');
    const closeBtn = document.getElementById('pairing-close');
    const connectionBar = document.getElementById('connection-bar');
    const matchesBtn = document.getElementById('matches-btn');

    let status = 'idle';
    let message = '';
    let shareIntent = false;
    let open = false;

    function presentation() {
        if (status === 'paired') {
            return 'paired';
        }
        if (status === 'connecting') {
            return 'connecting';
        }
        if (status === 'error') {
            return 'error';
        }
        return 'idle';
    }

    function render() {
        const kind = presentation();
        idlePanel.classList.toggle('hidden', kind !== 'idle');
        connectingPanel.classList.toggle('hidden', kind !== 'connecting');
        pairedPanel.classList.toggle('hidden', kind !== 'paired');
        errorPanel.classList.toggle('hidden', kind !== 'error');
        root.classList.toggle('hidden', !open);
        connectionBar.classList.toggle('hidden', kind !== 'paired');
        if (matchesBtn) {
            matchesBtn.classList.toggle('hidden', kind !== 'paired');
        }

        connectingText.textContent = message || 'Waiting for your spouse to open the link';
        errorText.textContent = message || 'Could not connect. Check the link and try again.';
        copyAgainBtn.classList.toggle('hidden', !shareIntent);
    }

    async function copyInvite() {
        shareIntent = true;
        try {
            const token = await options.host();
            const url = options.makeShareUrl(token);
            await navigator.clipboard.writeText(url);
            copyBtn.textContent = 'Copied. Send it in a text.';
            copyAgainBtn.textContent = 'Copied. Send it in a text.';
            setTimeout(() => {
                copyBtn.textContent = 'Copy invite link';
                copyAgainBtn.textContent = 'Copy invite link again';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy invite:', err);
            accept({
                type: 'status',
                status: 'error',
                message: err.message || 'Could not copy the invite link'
            });
        }
        render();
    }

    async function joinFromField() {
        await join(joinInput.value);
        joinInput.value = '';
    }

    /**
     * @param {string} raw
     * @returns {Promise<void>}
     */
    async function join(raw) {
        const token = normalizePairToken(raw);
        if (!token) {
            accept({
                type: 'status',
                status: 'error',
                message: 'Paste an invite link to join.'
            });
            open = true;
            render();
            return;
        }
        shareIntent = false;
        try {
            await options.join(token);
        } catch (err) {
            console.error('Failed to join:', err);
            accept({
                type: 'status',
                status: 'error',
                message: err.message || 'Could not join. Check the link and try again.'
            });
        }
        render();
    }

    async function disconnect() {
        shareIntent = false;
        await options.disconnect();
        render();
    }

    /**
     * @param {{ type: 'status', status: string, message?: string }} event
     */
    function accept(event) {
        if (event.type !== 'status') {
            return;
        }
        status = event.status === 'paired' || event.status === 'connecting' || event.status === 'error'
            ? event.status
            : 'idle';
        message = event.message || '';
        if (status === 'idle') {
            shareIntent = false;
        }
        render();
    }

    function show() {
        open = true;
        render();
    }

    function hide() {
        open = false;
        render();
    }

    openBtn.addEventListener('click', show);
    closeBtn.addEventListener('click', hide);
    overlay.addEventListener('click', hide);
    copyBtn.addEventListener('click', () => {
        copyInvite().catch((err) => console.error(err));
    });
    copyAgainBtn.addEventListener('click', () => {
        copyInvite().catch((err) => console.error(err));
    });
    joinBtn.addEventListener('click', () => {
        joinFromField().catch((err) => console.error(err));
    });
    joinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
    cancelBtn.addEventListener('click', () => {
        disconnect().catch((err) => console.error(err));
    });
    disconnectBtn.addEventListener('click', () => {
        disconnect().catch((err) => console.error(err));
    });
    retryBtn.addEventListener('click', () => {
        accept({ type: 'status', status: 'idle', message: '' });
        open = true;
        render();
    });

    render();

    return {
        open: show,
        join,
        accept
    };
}
