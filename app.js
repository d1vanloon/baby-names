/**
 * Baby Names Picker - Main Application
 */

import {
    getLastName,
    setLastName,
    getLikes,
    addLike
} from './storage.js';

import {
    loadNameData,
    peekNextNames,
    consumeCurrentName,
    hasMoreNames,
    resetAllNames
} from './nameData.js';

import {
    initSwipeHandlers,
    createCard,
    triggerSwipe
} from './swipeCard.js';

import {
    initLikesManager,
    renderLikesList,
    updateLikesCount
} from './likesManager.js';

import {
    initPeerSession,
    generateShareLink,
    getRoomFromUrl,
    clearRoomParam,
    joinSession,
    createNewSession,
    notifyLike,
    isConnected,
    isInRoom,
    disconnect,
    getMatches,
    getCurrentTopic,
    getStoredSessionTopic,
    ConnectionStatus,
    initializeAndReconnect
} from './peerSession.js';

import {
    initMatchAnimation,
    showMatchAnimation
} from './matchAnimation.js';

// ========================================
// DOM Elements
// ========================================
const elements = {
    // Screens
    loadingScreen: document.getElementById('loading-screen'),
    setupScreen: document.getElementById('setup-screen'),
    swipeScreen: document.getElementById('swipe-screen'),
    likesScreen: document.getElementById('likes-screen'),
    matchesScreen: document.getElementById('matches-screen'),

    // Loading
    progressBar: document.getElementById('progress-bar'),

    // Setup
    lastNameInput: document.getElementById('last-name-input'),
    startBtn: document.getElementById('start-btn'),

    // Swipe
    cardStack: document.getElementById('card-stack'),
    emptyState: document.getElementById('empty-state'),
    skipBtn: document.getElementById('skip-btn'),
    likeBtn: document.getElementById('like-btn'),
    resetNamesBtn: document.getElementById('reset-names-btn'),

    // Header
    likesBtn: document.getElementById('likes-btn'),
    likesCount: document.getElementById('likes-count'),
    sessionBtn: document.getElementById('session-btn'),

    // Connection bar
    connectionBar: document.getElementById('connection-bar'),
    connectionStatus: document.getElementById('connection-status'),
    matchesBtn: document.getElementById('matches-btn'),
    matchesCount: document.getElementById('matches-count'),
    disconnectBtn: document.getElementById('disconnect-btn'),

    // Likes screen
    likesList: document.getElementById('likes-list'),
    likesEmpty: document.getElementById('likes-empty'),
    backFromLikesBtn: document.getElementById('back-from-likes-btn'),

    // Matches screen
    matchesList: document.getElementById('matches-list'),
    matchesEmpty: document.getElementById('matches-empty'),
    backFromMatchesBtn: document.getElementById('back-from-matches-btn'),

    // Session modal
    sessionModal: document.getElementById('session-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    sessionRoomSection: document.getElementById('session-room-section'),
    sessionCode: document.getElementById('session-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    sessionJoinSection: document.getElementById('session-join-section'),
    roomCodeInput: document.getElementById('room-code-input'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    sessionStatus: document.getElementById('session-status'),
    sessionStatusIcon: document.getElementById('session-status-icon'),
    sessionStatusText: document.getElementById('session-status-text'),
    sessionConnected: document.getElementById('session-connected'),
    modalDisconnectBtn: document.getElementById('modal-disconnect-btn'),

    // Match animation
    matchOverlay: document.getElementById('match-overlay'),
    matchName: document.getElementById('match-name'),
    confettiContainer: document.getElementById('confetti-container')
};

// ========================================
// State
// ========================================
let currentLastName = '';
let currentMatches = [];

// ========================================
// Screen Management
// ========================================
function showScreen(screenName) {
    const screens = ['loading', 'setup', 'swipe', 'likes', 'matches'];
    screens.forEach(name => {
        const el = elements[`${name}Screen`];
        if (el) {
            el.classList.toggle('hidden', name !== screenName);
        }
    });
}

// ========================================
// Card Stack
// ========================================
function renderCardStack(animate = false) {
    elements.cardStack.innerHTML = '';

    const names = peekNextNames(3);

    if (names.length === 0) {
        elements.emptyState.classList.remove('hidden');
        return;
    }

    elements.emptyState.classList.add('hidden');

    // Create cards in order: first card (index 0) is the top interactive card
    // CSS nth-child(2) and nth-child(3) style cards behind
    for (let i = 0; i < names.length; i++) {
        const card = createCard(names[i], currentLastName, i === 0);

        // Add entrance animations when cards shift after a swipe
        if (animate) {
            if (i === 0) {
                // New top card - animate entering from behind
                card.classList.add('card-entering');
            } else if (i === 1) {
                // Second card shifting up
                card.classList.add('card-shifting-up');
            } else if (i === 2) {
                // New card appearing at bottom
                card.classList.add('card-new');
            }

            // Remove animation class after animation completes
            card.addEventListener('animationend', () => {
                card.classList.remove('card-entering', 'card-shifting-up', 'card-new');
            }, { once: true });
        }

        elements.cardStack.appendChild(card);
    }
}

function handleSwipeRight() {
    const name = consumeCurrentName();
    if (name) {
        addLike(name);
        updateLikesCount();

        // Notify partner if connected
        if (isConnected()) {
            notifyLike(name);
        }
    }
    renderCardStack(true); // Animate the new cards
}

function handleSwipeLeft() {
    consumeCurrentName();
    renderCardStack(true); // Animate the new cards
}

// ========================================
// Matches
// ========================================
function handleMatchFound(name) {
    showMatchAnimation(name, currentLastName);
}

function handleMatchesUpdated(matches) {
    currentMatches = matches;
    elements.matchesCount.textContent = matches.length;
}

function renderMatchesList() {
    elements.matchesList.innerHTML = '';

    if (currentMatches.length === 0) {
        elements.matchesEmpty.classList.remove('hidden');
        elements.matchesList.classList.add('hidden');
    } else {
        elements.matchesEmpty.classList.add('hidden');
        elements.matchesList.classList.remove('hidden');

        for (const name of currentMatches) {
            const item = document.createElement('div');
            item.className = 'name-item';
            item.innerHTML = `
                <span class="name-item-text">💕 ${escapeHtml(name)} ${escapeHtml(currentLastName)}</span>
            `;
            elements.matchesList.appendChild(item);
        }
    }
}

// ========================================
// Connection
// ========================================
function handleConnectionChange(connected) {
    elements.connectionBar.classList.toggle('hidden', !connected);

    if (connected) {
        elements.connectionStatus.textContent = '🔗 Connected with partner';
    }

    // Update session modal buttons
    if (!elements.sessionModal.classList.contains('hidden')) {
        updateSessionModalState();
    }
}

function handleStatusChange(status, message) {
    const statusEl = elements.sessionStatus;
    const iconEl = elements.sessionStatusIcon;
    const textEl = elements.sessionStatusText;

    // Remove all status classes
    statusEl.classList.remove('status-loading', 'status-connected', 'status-error');

    switch (status) {
        case ConnectionStatus.CONNECTING:
            statusEl.classList.add('status-loading');
            iconEl.textContent = '⏳';
            textEl.textContent = message || 'Connecting...';
            break;
        case ConnectionStatus.IN_ROOM:
            iconEl.textContent = '📡';
            textEl.textContent = message || 'Ready to connect, waiting for partner...';
            break;
        case ConnectionStatus.CONNECTED:
            statusEl.classList.add('status-connected');
            iconEl.textContent = '✅';
            textEl.textContent = message || 'Connected to partner!';
            if (!elements.sessionModal.classList.contains('hidden')) {
                updateSessionModalState();
            }
            break;
        case ConnectionStatus.ERROR:
            statusEl.classList.add('status-error');
            iconEl.textContent = '❌';
            textEl.textContent = message || 'Connection error';
            break;
        case ConnectionStatus.DISCONNECTED:
        default:
            iconEl.textContent = '📴';
            textEl.textContent = message || 'Enter a code to connect or start a new connection';
            if (!elements.sessionModal.classList.contains('hidden')) {
                updateSessionModalState();
            }
            break;
    }
}

// ========================================
// Session Modal
// ========================================
function showSessionModal() {
    elements.sessionModal.classList.remove('hidden');
    updateSessionModalState();
}

function updateSessionModalState() {
    const topic = getCurrentTopic() || getStoredSessionTopic();
    const inRoom = isInRoom();
    const connected = isConnected();

    // Show current room code if in a room
    if (topic) {
        elements.sessionCode.value = topic;
    } else {
        elements.sessionCode.value = '';
    }
}

function hideSessionModal() {
    elements.sessionModal.classList.add('hidden');
}

// ========================================
// Event Handlers
// ========================================
function setupEventHandlers() {
    // Setup screen
    elements.startBtn.addEventListener('click', () => {
        const lastName = elements.lastNameInput.value.trim();
        if (lastName) {
            setLastName(lastName);
            currentLastName = lastName;
            showScreen('swipe');
            renderCardStack();
        }
    });

    elements.lastNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.startBtn.click();
        }
    });

    // Swipe buttons
    elements.skipBtn.addEventListener('click', () => triggerSwipe('left'));
    elements.likeBtn.addEventListener('click', () => triggerSwipe('right'));

    // Reset names
    elements.resetNamesBtn.addEventListener('click', () => {
        resetAllNames();
        renderCardStack();
    });

    // Navigation
    elements.likesBtn.addEventListener('click', () => {
        renderLikesList();
        showScreen('likes');
    });

    elements.backFromLikesBtn.addEventListener('click', () => {
        showScreen('swipe');
    });

    elements.matchesBtn.addEventListener('click', () => {
        renderMatchesList();
        showScreen('matches');
    });

    elements.backFromMatchesBtn.addEventListener('click', () => {
        showScreen('swipe');
    });

    // Session modal
    elements.sessionBtn.addEventListener('click', showSessionModal);

    elements.closeModalBtn.addEventListener('click', hideSessionModal);

    elements.sessionModal.querySelector('.modal-overlay').addEventListener('click', hideSessionModal);

    elements.copyCodeBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(elements.sessionCode.value);
            elements.copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyCodeBtn.textContent = 'Copy';
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            elements.sessionCode.select();
            document.execCommand('copy');
        }
    });

    elements.copyLinkBtn.addEventListener('click', async () => {
        try {
            const link = await generateShareLink();
            await navigator.clipboard.writeText(link);
            elements.copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyLinkBtn.textContent = 'Copy Link';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
        }
    });

    // Join room button
    elements.joinRoomBtn.addEventListener('click', async () => {
        const roomCode = elements.roomCodeInput.value.trim();
        if (roomCode) {
            try {
                await joinSession(roomCode);
                elements.roomCodeInput.value = '';
                updateSessionModalState();
            } catch (err) {
                console.error('Failed to join room:', err);
                alert('Failed to join room. Please check the code and try again.');
            }
        }
    });

    // Allow Enter key to join room
    elements.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.joinRoomBtn.click();
        }
    });

    // Disconnect
    elements.disconnectBtn.addEventListener('click', async () => {
        await disconnect();
    });

    // Modal disconnect button
    elements.modalDisconnectBtn.addEventListener('click', async () => {
        await disconnect();
    });
}

// ========================================
// Utilities
// ========================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// Initialization
// ========================================
async function init() {
    // Initialize modules
    initSwipeHandlers({
        onSwipeLeft: handleSwipeLeft,
        onSwipeRight: handleSwipeRight
    });

    initLikesManager({
        likesList: elements.likesList,
        likesEmpty: elements.likesEmpty,
        likesCount: elements.likesCount
    }, updateLikesCount);

    initPeerSession({
        onMatchFound: handleMatchFound,
        onConnectionChange: handleConnectionChange,
        onMatchesUpdated: handleMatchesUpdated,
        onStatusChange: handleStatusChange
    });

    initMatchAnimation({
        matchOverlay: elements.matchOverlay,
        matchName: elements.matchName,
        confettiContainer: elements.confettiContainer
    });

    // Setup event handlers
    setupEventHandlers();

    // Show loading screen
    showScreen('loading');

    // Load name data with progress callback
    await loadNameData((progress) => {
        elements.progressBar.style.width = `${progress}%`;
    });

    // Check for existing last name
    currentLastName = getLastName();

    // Check for room code in URL
    const roomCode = getRoomFromUrl();

    if (currentLastName) {
        // Returning user
        showScreen('swipe');
        renderCardStack();
        updateLikesCount();

        // Auto-connect if room code provided, otherwise try to reconnect to stored session
        if (roomCode) {
            clearRoomParam();
            try {
                await joinSession(roomCode);
                updateSessionModalState();
            } catch (err) {
                console.error('Failed to join room:', err);
                alert('Failed to join room. Please check the code and try again.');
            }
        } else {
            // Try to reconnect to previously connected session
            try {
                await initializeAndReconnect();
            } catch (err) {
                console.error('Auto-reconnect failed:', err);
            }
        }
    } else {
        // New user
        showScreen('setup');

        // Handle room code from URL after setup
        if (roomCode) {
            elements.startBtn.addEventListener('click', async () => {
                clearRoomParam();
                try {
                    await joinSession(roomCode);
                    updateSessionModalState();
                } catch (err) {
                    console.error('Failed to join room:', err);
                }
            }, { once: true });
        }
    }
}

// Start the app
init().catch(console.error);
