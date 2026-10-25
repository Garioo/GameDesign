# iPhone and home-screen use

Foundry supports the browser and an installed home-screen web app from the same URL.

To install on iPhone, open the deployed HTTPS site in Safari, tap **Share → Add to Home Screen**, keep **Open as Web App** enabled if shown, and tap **Add**. Launch Foundry from its new icon. iOS may ask you to sign in separately from Safari. These steps are also available in the sign-in screen and Settings.

The app includes a standalone manifest, opaque app icons, Apple web-app metadata, safe-area spacing, and dynamic viewport sizing. Pinch zoom remains available. Phone navigation and toolbars support touch, horizontal scrolling, portrait and landscape. Search has a visible Close button, and canvas tools have a tap control for workspace navigation.

The current release requires a connection for workspace data. An offline launch shows a reconnect screen. Full offline editing and synchronization are deferred; there is no database migration required for these iPhone changes.

## Verification

Run the normal production build and start it, then run the mobile browser regression test:

```sh
npm run build
npm start
PLAYWRIGHT_MODULE=/absolute/path/to/playwright APP_URL=http://localhost:3000 node tests/browser-mobile.cjs
BROWSER_ENGINE=webkit PLAYWRIGHT_MODULE=/absolute/path/to/playwright APP_URL=http://localhost:3000 node tests/browser-mobile.cjs
```

Run `tests/browser-pwa.cjs` with the same environment variables to check the installation metadata and offline reconnect screen.

The mobile test intercepts Supabase requests and uses disposable fixtures; it never writes to the live workspace. It checks page overflow at 375, 390, 844 and 1440 pixels, touch navigation, editor saves, search, drawers, settings, task forms, calendar creation and canvas navigation.

Before release, use a physical iPhone to check Safari and the installed app: OAuth sign-in, the status bar and home indicator, keyboard opening/dismissal, photo selection, pinch zoom, app suspension/resume, and navigation after opening shared links. Browser emulation cannot establish these device-specific behaviors.
