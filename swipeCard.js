/**
 * Swipe card component with touch and mouse gesture support
 */

import { escapeHtml } from './utils.js';

// Swipe threshold in pixels
const SWIPE_THRESHOLD = 100;

// Rotation factor for visual feedback
const ROTATION_FACTOR = 0.15;

// State
let startX = 0;
let currentX = 0;
let isDragging = false;
let dragCard = null;

// Callbacks
let onSwipeLeft = null;
let onSwipeRight = null;
let cardStackEl = null;

// Track if global listeners are set up
let globalListenersAttached = false;

/**
 * Initialize swipe handlers
 * @param {Object} callbacks
 * @param {Function} callbacks.onSwipeLeft
 * @param {Function} callbacks.onSwipeRight
 * @param {HTMLElement} callbacks.cardStack
 */
export function initSwipeHandlers(callbacks) {
    onSwipeLeft = callbacks.onSwipeLeft;
    onSwipeRight = callbacks.onSwipeRight;
    cardStackEl = callbacks.cardStack;

    // Set up global document listeners once
    if (!globalListenersAttached) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
        document.addEventListener('touchcancel', handleTouchEnd);
        globalListenersAttached = true;
    }
}

/**
 * Create a name card element
 * @param {string} firstName
 * @param {string} lastName
 * @param {boolean} isTop - Whether this is the top (interactive) card
 * @returns {HTMLElement}
 */
export function createCard(firstName, lastName, isTop = false) {
    const card = document.createElement('div');
    card.className = 'name-card';
    card.innerHTML = `
        <div class="card-hint like">LIKE</div>
        <div class="card-hint skip">NOPE</div>
        <div class="card-content">
            <div class="first-name">${escapeHtml(firstName)}</div>
            <div class="last-name">${escapeHtml(lastName)}</div>
        </div>
    `;

    if (isTop) {
        // Only the top card is interactive
        card.addEventListener('mousedown', handleMouseDown);
        card.addEventListener('touchstart', handleTouchStart, { passive: true });
        card.dataset.interactive = 'true';
    }

    return card;
}

/**
 * Handle mouse down on card
 * @param {MouseEvent} e
 */
function handleMouseDown(e) {
    // Only respond to left mouse button
    if (e.button !== 0) return;

    const card = e.currentTarget;
    if (!card.dataset.interactive) return;

    e.preventDefault();
    startDrag(card, e.clientX);
}

/**
 * Handle touch start on card
 * @param {TouchEvent} e
 */
function handleTouchStart(e) {
    const card = e.currentTarget;
    if (!card.dataset.interactive) return;

    const touch = e.touches[0];
    startDrag(card, touch.clientX);
}

/**
 * Start dragging a card
 * @param {HTMLElement} card
 * @param {number} x
 */
function startDrag(card, x) {
    isDragging = true;
    dragCard = card;
    startX = x;
    currentX = 0;

    // Disable transition during drag
    card.style.transition = 'none';
    card.style.cursor = 'grabbing';
}

/**
 * Handle mouse move
 * @param {MouseEvent} e
 */
function handleMouseMove(e) {
    if (!isDragging || !dragCard) return;
    updateDrag(e.clientX);
}

/**
 * Handle touch move
 * @param {TouchEvent} e
 */
function handleTouchMove(e) {
    if (!isDragging || !dragCard) return;

    const touch = e.touches[0];
    updateDrag(touch.clientX);

    // Prevent page scrolling when swiping
    if (Math.abs(currentX) > 10) {
        e.preventDefault();
    }
}

/**
 * Update drag position
 * @param {number} x
 */
function updateDrag(x) {
    currentX = x - startX;
    const rotation = currentX * ROTATION_FACTOR;

    dragCard.style.transform = `translateX(${currentX}px) rotate(${rotation}deg)`;

    // Update visual feedback classes
    dragCard.classList.remove('swiping-left', 'swiping-right');
    if (currentX > 50) {
        dragCard.classList.add('swiping-right');
    } else if (currentX < -50) {
        dragCard.classList.add('swiping-left');
    }
}

/**
 * Handle mouse up
 * @param {MouseEvent} e
 */
function handleMouseUp(e) {
    if (!isDragging || !dragCard) return;
    endDrag();
}

/**
 * Handle touch end
 * @param {TouchEvent} e
 */
function handleTouchEnd(e) {
    if (!isDragging || !dragCard) return;
    endDrag();
}

/**
 * End the drag and determine swipe direction
 */
function endDrag() {
    if (!dragCard) return;

    isDragging = false;
    const card = dragCard;
    dragCard = null;

    card.style.cursor = '';

    if (Math.abs(currentX) >= SWIPE_THRESHOLD) {
        // Swipe detected
        const direction = currentX > 0 ? 'right' : 'left';
        animateSwipeOut(card, direction);
    } else {
        // Return to center
        card.style.transition = 'transform 0.3s ease';
        card.style.transform = '';
        card.classList.remove('swiping-left', 'swiping-right');
    }

    currentX = 0;
}

/**
 * Animate card swiping out
 * @param {HTMLElement} card
 * @param {'left'|'right'} direction
 */
function animateSwipeOut(card, direction) {
    const targetX = direction === 'right' ? window.innerWidth + 200 : -window.innerWidth - 200;
    const rotation = direction === 'right' ? 30 : -30;

    // Mark as exiting so it won't respond to events
    card.dataset.interactive = 'false';
    card.classList.add('exiting');
    card.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
    card.style.transform = `translateX(${targetX}px) rotate(${rotation}deg)`;
    card.style.opacity = '0';

    setTimeout(() => {
        card.remove();
        if (direction === 'right' && onSwipeRight) {
            onSwipeRight();
        } else if (direction === 'left' && onSwipeLeft) {
            onSwipeLeft();
        }
    }, 400);
}

/**
 * Programmatically trigger a swipe (for button clicks)
 * @param {'left'|'right'} direction
 */
export function triggerSwipe(direction) {
    const topCard = cardStackEl?.querySelector('.name-card:first-child');

    if (!topCard || topCard.dataset.interactive !== 'true') return;

    // Add visual feedback
    topCard.classList.add(direction === 'right' ? 'swiping-right' : 'swiping-left');

    // Small delay then animate out
    setTimeout(() => {
        animateSwipeOut(topCard, direction);
    }, 100);
}
