/**
 * Match animation module
 */

let overlayEl = null;
let matchNameEl = null;
let confettiContainer = null;

const CONFETTI_COLORS = ['#f093fb', '#f5576c', '#667eea', '#764ba2', '#22c55e', '#fbbf24'];
const CONFETTI_COUNT = 50;

/**
 * Initialize match animation
 * @param {Object} elements
 */
export function initMatchAnimation(elements) {
    overlayEl = elements.matchOverlay;
    matchNameEl = elements.matchName;
    confettiContainer = elements.confettiContainer;
}

/**
 * Show match animation
 * @param {string} firstName
 * @param {string} lastName
 */
export function showMatchAnimation(firstName, lastName) {
    if (!overlayEl || !matchNameEl) return;

    matchNameEl.textContent = `${firstName} ${lastName}`;
    overlayEl.classList.remove('hidden');

    // Create confetti
    createConfetti();

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        hideMatchAnimation();
    }, 3000);

    // Click to dismiss
    overlayEl.addEventListener('click', hideMatchAnimation, { once: true });
}

/**
 * Hide match animation
 */
function hideMatchAnimation() {
    if (!overlayEl) return;
    overlayEl.classList.add('hidden');

    // Clear confetti
    if (confettiContainer) {
        confettiContainer.innerHTML = '';
    }
}

/**
 * Create confetti particles
 */
function createConfetti() {
    if (!confettiContainer) return;

    confettiContainer.innerHTML = '';

    for (let i = 0; i < CONFETTI_COUNT; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';

        // Random properties
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 2;
        const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        const size = 6 + Math.random() * 8;
        const shape = Math.random() > 0.5 ? '50%' : '0';

        confetti.style.cssText = `
            left: ${left}%;
            background: ${color};
            width: ${size}px;
            height: ${size}px;
            border-radius: ${shape};
            animation-delay: ${delay}s;
            animation-duration: ${duration}s;
        `;

        confettiContainer.appendChild(confetti);
    }
}
