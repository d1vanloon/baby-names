# Baby Names Picker

A fun, Tinder-style web application for couples to discover and agree on baby names together. Swipe through thousands of names, like your favorites, and find matches when you both love the same name!

## Overview

Baby Names Picker is an interactive web app that helps expecting parents find the perfect name for their baby. It features a modern, swipeable card interface similar to dating apps, making the name selection process engaging and fun.

### Key Features

- **Tinder-Style Swiping**: Swipe right to like names, left to skip
- **Real-Time Spouse Connection**: Connect with your spouse to sync likes and discover matches instantly
- **Thousands of Names**: Database of popular baby names from 1880-2024 (filtered to names with 5,000+ occurrences)
- **Personalized Display**: Enter your last name to see how full names look
- **Match Celebrations**: Beautiful animations when you and your spouse both like the same name
- **Session Persistence**: Your likes and spouse connections are saved locally

## How to Run

This is a client-side web application that runs in any modern browser. No server or build step is required.

### Option 1: Open Directly
1. Clone or download this repository
2. Open `index.html` in your web browser
3. Start swiping!

### Option 2: Use a Local Server (Recommended)
For the best experience (especially for the data loading), serve the files using a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## How to Use

### Solo Mode
1. Enter your last name on the welcome screen
2. Click "Start Swiping"
3. Swipe right (or click the heart) to like a name
4. Swipe left (or click the X) to skip a name
5. Click the heart icon to view your liked names anytime

### Spouse Mode
1. Click the link icon (🔗) in the header
2. Copy the generated session link
3. Share the link with your spouse
4. When your spouse opens the link, you'll be connected
5. Both of you can swipe independently
6. When you both like the same name, you'll see a match celebration!
7. View your mutual matches by clicking the "Matches" button

### Data

The application uses historical baby name data from the U.S. Social Security Administration, covering years 1880-2024. Only names with 5,000 or more recorded occurrences are included in the swipe deck.

## Technical Details

- **Pure JavaScript**: No frameworks, vanilla JS with ES6 modules
- **WebRTC (ntfy)**: Real-time WebRTC peer-to-peer connections for spouse syncing
- **LocalStorage**: Persistent storage for likes and settings
- **Responsive Design**: Works on desktop and mobile devices
- **Vitest**: Unit testing framework with jsdom for DOM testing

## Browser Requirements

- Modern browser with ES6 module support (Chrome, Firefox, Safari, Edge)
- WebRTC support required for spouse connection feature
- LocalStorage support for saving likes

## Project Structure

```
├── index.html          # Main HTML file
├── app.js              # Main application logic
├── nameData.js         # Name data loading and management
├── swipeCard.js        # Swipe gesture handling
├── likesManager.js     # Likes list management
├── peerSession.js      # Spouse connection via WebRTC
├── matchAnimation.js   # Match celebration animations
├── storage.js          # LocalStorage utilities
├── styles.css          # Application styles
├── test/               # Unit tests
│   ├── storage.test.js
│   ├── nameData.test.js
│   ├── peerSession.test.js
│   └── utils.test.js
└── data/               # Baby name data files (yobYYYY.txt)
    ├── yob1880.txt
    ├── yob1881.txt
    └── ...
```

## License

This project is open source. Feel free to use and modify as needed.

## Testing

The project includes unit tests using [Vitest](https://vitest.dev/) with jsdom for DOM testing.

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

Tests cover:
- LocalStorage operations (`test/storage.test.js`)
- Name queue management (`test/nameData.test.js`)
- Peer connection pure functions (`test/peerSession.test.js`)
- Utility functions (`test/utils.test.js`)

## Credits

Baby name data provided by the U.S. Social Security Administration.
