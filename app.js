/**
 * Baby Names Picker - Main Application
 */

import {
    getLastName,
    setLastName
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

import { createPartnerSession } from './partnerSession.js';

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
    setShareToken,
    handleStatusChange
} from './sessionModal.js';

const elements = {
    loadingScreen: document.getElementById('loading-screen'),
    setupScreen: document.getElementById('setup-screen'),
    swipeScreen: document.getElementById('swipe-screen'),
    likesScreen: document.getElementById('likes-screen'),
    matchesScreen: document.getElementById('matches-screen'),
    progressBar: document.getElementById('progress-bar'),
    lastNameInput: document.getElementById('last-name-input'),
    startBtn: document.getElementById('start-btn'),
    cardStack: document.getElementById('card-stack'),
    emptyState: document.getElementById('empty-state'),
    skipBtn: document.getElementById('skip-btn'),
    likeBtn: document.getElementById('like-btn'),
    resetNamesBtn: document.getElementById('reset-names-btn'),
    likesBtn: document.getElementById('likes-btn'),
    likesCount: document.getElementById('likes-count'),
    sessionBtn: document.getElementById('session-btn'),
    matchesBtn: document.getElementById('matches-btn'),
    matchesCount: document.getElementById('matches-count'),
    connectionBar: document.getElementById('connection-bar'),
    connectionStatus: document.getElementById('connection-status'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    likesList: document.getElementById('likes-list'),
    likesEmpty: document.getElementById('likes-empty'),
    backFromLikesBtn: document.getElementById('back-from-likes-btn'),
    matchesList: document.getElementById('matches-list'),
    matchesEmpty: document.getElementById('matches-empty'),
    backFromMatchesBtn: document.getElementById('back-from-matches-btn'),
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
    matchOverlay: document.getElementById('match-overlay'),
    matchName: document.getElementById('match-name'),
    confettiContainer: document.getElementById('confetti-container')
};

const session = createPartnerSession();

let currentLastName = '';
let currentMatches = [];
let partnerLikes = new Set();
let pendingPairToken = null;

/**
 * @returns {string|null}
 */
function getPairTokenFromUrl() {
    try {
        return new URL(window.location.href).searchParams.get('pair');
    } catch {
        return null;
    }
}

function stripPairParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('pair')) {
        return;
    }
    url.searchParams.delete('pair');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Accept a pasted token or a full share URL.
 * @param {string} raw
 * @returns {string}
 */
function normalizePairToken(raw) {
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
 * @param {string} token
 * @returns {string}
 */
function shareUrlForToken(token) {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('pair', token);
    return url.toString();
}

/**
 * @returns {Promise<string>}
 */
async function generateShareLink() {
    const token = await session.host();
    return shareUrlForToken(token);
}

/**
 * @param {string} raw
 * @returns {Promise<void>}
 */
async function joinFromToken(raw) {
    const token = normalizePairToken(raw);
    if (!token) {
        throw new Error('Missing pairing token');
    }
    await session.join(token);
}

function showScreen(screenName) {
    const screens = ['loading', 'setup', 'swipe', 'likes', 'matches'];
    screens.forEach((name) => {
        const el = elements[`${name}Screen`];
        if (el) {
            el.classList.toggle('hidden', name !== screenName);
        }
    });
}

function renderCardStack(animate = false) {
    elements.cardStack.innerHTML = '';

    if (partnerLikes.size > 0) {
        insertPriorityNames(partnerLikes, 3);
    }

    const names = peekNextNames(3);

    if (names.length === 0) {
        elements.emptyState.classList.remove('hidden');
        return;
    }

    elements.emptyState.classList.add('hidden');

    for (let i = 0; i < names.length; i++) {
        const card = createCard(names[i], currentLastName, i === 0);

        if (animate) {
            if (i === 0) {
                card.classList.add('card-entering');
            } else if (i === 1) {
                card.classList.add('card-shifting-up');
            } else if (i === 2) {
                card.classList.add('card-new');
            }

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
        session.like(name);
        updateLikesCount();
    }
    renderCardStack(true);
}

function handleSwipeLeft() {
    consumeCurrentName();
    renderCardStack(true);
}

function handleLikesChanged() {
    updateLikesCount();
    currentMatches = session.matches();
    updateMatchesCount(currentMatches.length);
}

function setupEventHandlers() {
    elements.startBtn.addEventListener('click', async () => {
        const lastName = elements.lastNameInput.value.trim();
        if (lastName) {
            setLastName(lastName);
            currentLastName = lastName;
            showScreen('swipe');
            renderCardStack();

            if (pendingPairToken) {
                const token = pendingPairToken;
                pendingPairToken = null;
                try {
                    await joinFromToken(token);
                } catch (err) {
                    console.error('Failed to join:', err);
                    alert('Failed to join. Please check the link and try again.');
                }
            }
        }
    });

    elements.lastNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.startBtn.click();
        }
    });

    elements.skipBtn.addEventListener('click', () => triggerSwipe('left'));
    elements.likeBtn.addEventListener('click', () => triggerSwipe('right'));

    elements.resetNamesBtn.addEventListener('click', () => {
        resetAllNames();
        renderCardStack();
    });

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

async function init() {
    initSwipeHandlers({
        onSwipeLeft: handleSwipeLeft,
        onSwipeRight: handleSwipeRight,
        cardStack: elements.cardStack
    });

    initLikesManager({
        likesList: elements.likesList,
        likesEmpty: elements.likesEmpty,
        likesCount: elements.likesCount
    }, handleLikesChanged);

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
        onJoinSession: joinFromToken,
        onDisconnect: () => session.disconnect(),
        onGenerateShareLink: generateShareLink
    });

    initMatchAnimation({
        matchOverlay: elements.matchOverlay,
        matchName: elements.matchName,
        confettiContainer: elements.confettiContainer
    });

    setupEventHandlers();

    const pairFromUrl = getPairTokenFromUrl();
    if (pairFromUrl) {
        stripPairParam();
    }

    session.subscribe({
        resume: !pairFromUrl,
        onStatus(status, message) {
            handleStatusChange(status, message);
        },
        onMatches(names) {
            currentMatches = names;
            updateMatchesCount(names.length);
        },
        onPartnerLikes(likes) {
            partnerLikes = likes;
            if (!elements.swipeScreen.classList.contains('hidden')) {
                renderCardStack();
            }
        },
        onMatch(name) {
            showMatchAnimation(name, currentLastName);
        },
        onToken(token) {
            setShareToken(token);
        }
    });

    showScreen('loading');

    await loadNameData((progress) => {
        elements.progressBar.style.width = `${progress}%`;
    });

    currentLastName = getLastName();

    if (currentLastName) {
        showScreen('swipe');
        renderCardStack();
        updateLikesCount();

        if (pairFromUrl) {
            try {
                await joinFromToken(pairFromUrl);
            } catch (err) {
                console.error('Failed to join:', err);
                alert('Failed to join. Please check the link and try again.');
            }
        }
    } else {
        showScreen('setup');
        pendingPairToken = pairFromUrl;
    }
}

init().catch(console.error);
