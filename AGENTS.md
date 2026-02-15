# AGENTS.md - Baby Names Picker

## Project Overview

A vanilla JavaScript PWA for couples to discover baby names together. Uses ES6 modules, PeerJS for real-time connections, and LocalStorage for persistence.

## Build/Run Commands

No build system required - this is a client-side only application.

### Development
```bash
# Start local development server
python -m http.server 8000
# OR
npx http-server -p 8000
```

Then open `http://localhost:8000` in browser.

### Testing

Tests use [Vitest](https://vitest.dev/) framework with jsdom for DOM testing.

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

Tests are located in the `test/` directory:
- `test/storage.test.js` - LocalStorage operations
- `test/nameData.test.js` - Name queue management
- `test/peerSession.test.js` - Peer connection pure functions
- `test/utils.test.js` - Utility functions (escapeHtml)

### Linting/Formatting

No linters configured. Consider adding ESLint and Prettier:
```bash
npm init -y
npm install --save-dev eslint prettier
```

## Code Style Guidelines

### JavaScript

- **Modules**: Use ES6 modules (`import`/`export`)
- **Indentation**: 4 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Line endings**: Unix-style (LF)

### Naming Conventions

- **Variables/functions**: camelCase (`loadNameData`, `currentName`)
- **Constants**: SCREAMING_SNAKE_CASE (`MIN_OCCURRENCES`, `CACHE_NAME`)
- **Enums/Status objects**: PascalCase (`ConnectionStatus`)
- **Private functions**: Leading underscore discouraged; use closure scope instead
- **Files**: camelCase.js for modules

### Imports

```javascript
// Group imports: built-ins, then external, then internal
import { something } from './storage.js';  // Always include .js extension
import { peerSession } from './peerSession.js';
```

### Documentation

Use JSDoc for all exported functions:

```javascript
/**
 * Description of what the function does
 * @param {string} paramName - Parameter description
 * @param {Function} [optionalParam] - Optional parameter
 * @returns {Promise<string[]>} Return description
 */
```

Update the README if needed when making changes to the project.

### Error Handling

- Use `try/catch` for async operations
- Log errors with `console.error()`
- Always include descriptive error messages
- Use `alert()` sparingly for user-facing errors

### Security

- Always escape HTML before DOM insertion using `escapeHtml()`:
```javascript
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

### Async Patterns

- Prefer `async/await` over Promise chains
- Always handle Promise rejections
- Use callbacks for event handlers passed to modules

### State Management

- Use module-level variables for state
- Prefix DOM element variables with element type (e.g., `likesListEl`)
- Use an `elements` object to group DOM references

### CSS Classes

- Use kebab-case for CSS classes (`.card-stack`, `.btn-primary`)
- Use `hidden` class to toggle visibility
- Prefer CSS transitions over JavaScript animations

## Project Structure

```
├── index.html          # Main HTML entry point
├── app.js              # Main application module
├── nameData.js         # Data loading and name management
├── swipeCard.js        # Touch/mouse swipe gestures
├── likesManager.js     # Likes list UI management
├── peerSession.js      # WebRTC peer connection
├── matchAnimation.js   # Match celebration UI
├── storage.js          # LocalStorage utilities
├── service-worker.js   # PWA service worker
├── styles.css          # Application styles
├── manifest.json       # PWA manifest
├── data/               # Baby name data files (yobYYYY.txt)
└── icons/              # PWA icons
```

## Dependencies

- **PeerJS**: Loaded from CDN (`https://unpkg.com/peerjs@1.5.4`)
- **Fonts**: Google Fonts (Outfit)

## Browser Support

- Modern browsers with ES6 module support
- WebRTC required for partner connections
- LocalStorage required for persistence
- Service Worker for offline functionality

## Environment Variables

None. Configuration stored in LocalStorage via `storage.js`.

## Git Conventions

- Commit messages: Present tense, descriptive (e.g., "Add partner reconnection logic")
- No pre-commit hooks configured
