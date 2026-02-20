/**
 * Baby Names Picker - Main Application
 */

import {
    getLastName,
    setLastName,
    addLike
} from './storage.js';

import {
    loadNameData,
    peekNextNames,
    insertPriorityNames,
    consumeCurrentName,
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
    notifyLike,
    isConnected,
    isInRoom,
    disconnect,
    getCurrentTopic,
    getStoredSessionTopic,
    getSpouseLikes,
    initializeAndReconnect
} from './ntfySession.js';

import {
    initMatchAnimation,
    showMatchAnimation
} from './matchAnimation.js';

import {
    initMatchesView,
    renderMatchesList,
    updateMatchesCount
} from './matchesView.js';

import {
    initSessionModal,
    updateSessionModalState,
    handleConnectionChange,
    handleStatusChange
} from './sessionModal.js';

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
    matchesBtn: document.getElementById('matches-btn'),
    matchesCount: document.getElementById('matches-count'),
    connectionBar: document.getElementById('connection-bar'),
    connectionStatus: document.getElementById('connection-status'),
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
    sessionCode: document.getElementById('session-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    roomCodeInput: document.getElementById('room-code-input'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    sessionStatus: document.getElementById('session-status'),
    sessionStatusIcon: document.getElementById('session-status-icon'),
    sessionStatusText: document.getElementById('session-status-text'),
    sessionConnected: document.getElementById('session-connected'),
    sessionResetBtn: document.getElementById('session-reset-btn'),
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
let pendingRoomCode = null;

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

    if (isConnected()) {
        insertPriorityNames(getSpouseLikes(), 3);
    }

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

        // Notify spouse if connected
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
    updateMatchesCount(matches.length);
}

// ========================================
// Event Handlers
// ========================================
function setupEventHandlers() {
    // Setup screen
    elements.startBtn.addEventListener('click', async () => {
        const lastName = elements.lastNameInput.value.trim();
        if (lastName) {
            setLastName(lastName);
            currentLastName = lastName;
            showScreen('swipe');
            renderCardStack();

            if (pendingRoomCode) {
                clearRoomParam();
                try {
                    await joinSession(pendingRoomCode);
                    updateSessionModalState();
                } catch (err) {
                    console.error('Failed to join room:', err);
                } finally {
                    pendingRoomCode = null;
                }
            }
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
        renderMatchesList(currentMatches, currentLastName);
        showScreen('matches');
    });

    elements.backFromMatchesBtn.addEventListener('click', () => {
        showScreen('swipe');
    });

}

// ========================================
// Initialization
// ========================================
async function init() {
    // Initialize modules
    initSwipeHandlers({
        onSwipeLeft: handleSwipeLeft,
        onSwipeRight: handleSwipeRight,
        cardStack: elements.cardStack
    });

    initLikesManager({
        likesList: elements.likesList,
        likesEmpty: elements.likesEmpty,
        likesCount: elements.likesCount
    }, updateLikesCount);

    initMatchesView({
        matchesList: elements.matchesList,
        matchesEmpty: elements.matchesEmpty,
        matchesCount: elements.matchesCount
    });

    initSessionModal({
        sessionBtn: elements.sessionBtn,
        sessionModal: elements.sessionModal,
        closeModalBtn: elements.closeModalBtn,
        sessionCode: elements.sessionCode,
        copyCodeBtn: elements.copyCodeBtn,
        copyLinkBtn: elements.copyLinkBtn,
        roomCodeInput: elements.roomCodeInput,
        joinRoomBtn: elements.joinRoomBtn,
        sessionStatus: elements.sessionStatus,
        sessionStatusIcon: elements.sessionStatusIcon,
        sessionStatusText: elements.sessionStatusText,
        sessionConnected: elements.sessionConnected,
        connectionBar: elements.connectionBar,
        connectionStatus: elements.connectionStatus,
        disconnectBtn: elements.disconnectBtn,
        modalDisconnectBtn: elements.modalDisconnectBtn,
        sessionResetBtn: elements.sessionResetBtn,
        onJoinSession: joinSession,
        onDisconnect: disconnect,
        onGenerateShareLink: generateShareLink,
        getCurrentTopic,
        getStoredSessionTopic,
        isInRoom,
        isConnected
    });

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

        pendingRoomCode = roomCode;
    }
}

// Start the app
init().catch(console.error);
