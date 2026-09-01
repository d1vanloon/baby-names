/**
 * Baby Names Picker - composition root
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

import { createPairingView } from './pairingView.js';

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
    matchesBtn: document.getElementById('matches-btn'),
    likesList: document.getElementById('likes-list'),
    likesEmpty: document.getElementById('likes-empty'),
    backFromLikesBtn: document.getElementById('back-from-likes-btn'),
    matchesList: document.getElementById('matches-list'),
    matchesEmpty: document.getElementById('matches-empty'),
    backFromMatchesBtn: document.getElementById('back-from-matches-btn'),
    matchOverlay: document.getElementById('match-overlay'),
    matchName: document.getElementById('match-name'),
    confettiContainer: document.getElementById('confetti-container')
};

const session = createPartnerSession();
const screens = ['loading', 'setup', 'swipe', 'likes', 'matches'];

let currentLastName = '';
let currentMatches = [];
let partnerLikes = new Set();
let pendingPairToken = null;
let pairingView = null;

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
 * Reveal one screen and render its contents. Callers never render separately.
 * @param {'loading'|'setup'|'swipe'|'likes'|'matches'} screenName
 */
function navigate(screenName) {
    for (const name of screens) {
        const el = elements[`${name}Screen`];
        if (el) {
            el.classList.toggle('hidden', name !== screenName);
        }
    }

    if (screenName === 'setup') {
        elements.lastNameInput.focus();
        return;
    }
    if (screenName === 'likes') {
        renderLikesList();
        return;
    }
    if (screenName === 'matches') {
        renderMatchesList(currentMatches, currentLastName);
        return;
    }
    if (screenName === 'swipe') {
        renderCardStack();
        updateLikesCount();
    }
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
        if (!lastName) {
            return;
        }
        setLastName(lastName);
        currentLastName = lastName;
        navigate('swipe');

        if (pendingPairToken) {
            const token = pendingPairToken;
            pendingPairToken = null;
            pairingView.open();
            await pairingView.join(token);
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

    elements.likesBtn.addEventListener('click', () => navigate('likes'));
    elements.backFromLikesBtn.addEventListener('click', () => navigate('swipe'));
    elements.matchesBtn.addEventListener('click', () => navigate('matches'));
    elements.backFromMatchesBtn.addEventListener('click', () => navigate('swipe'));
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
        likesCount: document.getElementById('likes-count')
    }, handleLikesChanged);

    initMatchesView({
        matchesList: elements.matchesList,
        matchesEmpty: elements.matchesEmpty,
        matchesCount: document.getElementById('matches-count')
    });

    pairingView = createPairingView({
        host: () => session.host(),
        join: (token) => session.join(token),
        disconnect: () => session.disconnect(),
        makeShareUrl: shareUrlForToken
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
            pairingView.accept({ type: 'status', status, message });
        },
        onMatches(names) {
            currentMatches = names;
            updateMatchesCount(names.length);
            if (!elements.matchesScreen.classList.contains('hidden')) {
                renderMatchesList(currentMatches, currentLastName);
            }
        },
        onPartnerLikes(likes) {
            partnerLikes = likes;
            if (!elements.swipeScreen.classList.contains('hidden')) {
                renderCardStack();
            }
        },
        onMatch(name) {
            showMatchAnimation(name, currentLastName);
        }
    });

    navigate('loading');

    await loadNameData((progress) => {
        elements.progressBar.style.width = `${progress}%`;
    });

    currentLastName = getLastName();

    if (currentLastName) {
        navigate('swipe');
        if (pairFromUrl) {
            pairingView.open();
            await pairingView.join(pairFromUrl);
        }
    } else {
        navigate('setup');
        pendingPairToken = pairFromUrl;
    }
}

init().catch(console.error);
