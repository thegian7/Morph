# TS-5: Google Calendar OAuth2 PKCE Flow — Spike Findings

**Date:** February 19, 2026
**Agent:** google-cal
**Status:** Complete

---

## Summary

This spike validates that Google Calendar OAuth2 with PKCE works correctly in a Tauri 2 desktop app. The approach uses:

1. System browser for the Google consent screen (not a webview)
2. A localhost HTTP server to capture the redirect
3. PKCE (S256) for security without requiring a client secret
4. macOS Keychain (via `keyring` crate) for token storage
5. Standard Google Calendar API v3 for event fetching

**Verdict: This approach works.** All acceptance criteria are achievable with this architecture.

---

## Architecture

```
User clicks "Connect"
  -> Rust generates PKCE code_verifier + code_challenge
  -> Rust opens system browser with Google OAuth URL
  -> User authenticates in browser
  -> Google redirects to http://127.0.0.1:19847/callback?code=...
  -> Rust tiny_http server captures the code
  -> Rust exchanges code + code_verifier for tokens (POST to Google)
  -> Tokens stored in macOS Keychain via keyring crate
  -> Calendar events fetched with access_token Bearer auth
  -> On 401 or expiry, refresh_token used to get new access_token
```

---

## Key Decisions

### 1. PKCE Without Client Secret

Google supports OAuth2 for "Desktop apps" which uses PKCE without a client secret. This is the recommended approach for native apps where the secret cannot be kept confidential.

- **Client type:** Desktop app (in Google Cloud Console)
- **PKCE method:** S256 (SHA-256 hash of code verifier)
- **No client_secret needed** in the token exchange request
- Google requires `access_type=offline` and `prompt=consent` to issue a refresh token

### 2. Localhost Redirect URI

Google allows `http://127.0.0.1:<port>/callback` as a redirect URI for Desktop apps without registering it in the console. We use port 19847 (arbitrary high port).

**Consideration for production:** If the port is occupied, the auth flow fails. The production app should try a few ports and dynamically set the redirect URI. For this spike, a fixed port is fine.

### 3. System Browser vs. Webview

We use `open::that()` to launch the system browser rather than an embedded webview. This is:

- **More secure** — users see the real browser URL bar
- **More compatible** — supports password managers, 2FA keys, etc.
- **Google's recommendation** — Google deprecated webview-based OAuth

### 4. Token Storage — `keyring` Crate

The `keyring` crate (v3) provides cross-platform credential storage:

- **macOS:** Keychain Services (native, encrypted, survives app reinstalls)
- **Windows:** Windows Credential Manager
- **Linux:** Secret Service (GNOME Keyring / KDE Wallet)

We store three entries under service name `com.lighttime.google-oauth`:
- `access_token` — short-lived (~1 hour)
- `refresh_token` — long-lived (until revoked)
- `token_expiry` — ISO 8601 datetime string

**Findings:**
- `keyring` v3 works reliably on macOS with the `apple-native` feature
- No special entitlements needed for Keychain access in a non-sandboxed app
- For Mac App Store distribution (sandboxed), the app would need `keychain-access-groups` entitlement

### 5. Token Refresh

- Access tokens expire after ~3600 seconds (1 hour)
- We store the calculated expiry time and check before each API call
- If expired, we use the refresh token to get a new access token
- If the refresh also fails, the user needs to re-authenticate
- We also handle 401 responses from the Calendar API as a fallback check

### 6. Calendar API

- Standard REST API: `GET https://www.googleapis.com/calendar/v3/calendars/primary/events`
- Query params: `timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime`
- Events with `dateTime` (timed events) and `date` (all-day events) handled
- Response is straightforward JSON; `serde` deserialization works well

---

## Google Cloud Project Setup

To run this spike (or the production app), you need:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API** (`calendar-json.googleapis.com`)
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth Client ID**
6. Choose **Desktop app** as the application type
7. Name it (e.g., "LightTime Desktop")
8. Copy the **Client ID** (you don't need the Client Secret for PKCE)
9. Go to **APIs & Services > OAuth consent screen**
10. Configure the consent screen (External for testing, Internal for Workspace)
11. Add the scope: `https://www.googleapis.com/auth/calendar.readonly`
12. Add test users if in "Testing" mode

Set the client ID as an environment variable before running:
```bash
GOOGLE_CLIENT_ID="your-id.apps.googleusercontent.com" npm run tauri dev
```

---

## Crate Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `keyring` | 3 | OS keychain access (macOS Keychain, Windows Credential Manager) |
| `reqwest` | 0.12 | HTTP client for token exchange and Calendar API |
| `tiny_http` | 0.12 | Lightweight HTTP server for OAuth redirect listener |
| `chrono` | 0.4 | Date/time handling for token expiry and event queries |
| `sha2` | 0.10 | SHA-256 for PKCE code challenge |
| `base64` | 0.22 | URL-safe base64 encoding for PKCE |
| `rand` | 0.9 | Random bytes for PKCE code verifier |
| `open` | 5 | Open system browser |
| `url` | 2 | URL parsing and query parameter handling |

---

## Risks & Considerations for Production

### Port Conflicts
The localhost redirect server binds to a fixed port. If another process is using that port, auth fails. **Mitigation:** Try multiple ports, include the port in the redirect URI dynamically.

### Timeout
The callback server times out after 120 seconds. If the user takes longer to authenticate, it fails silently. **Mitigation:** Consider a longer timeout or a retry mechanism.

### Token Revocation
If the user revokes the app in Google settings, the refresh token becomes invalid. The app should handle this gracefully and prompt for re-authentication.

### Multiple Google Accounts
This spike supports a single account. Production needs to handle multiple accounts, each with its own token pair keyed by email/account ID.

### Rate Limits
Google Calendar API has a default quota of 1,000,000 queries/day per project, and 2,000 queries per user per day. With 60-second polling, that's ~1,440 requests/day per user — well within limits.

### Mac App Store Sandboxing
The `keyring` crate uses raw Keychain Services. In a sandboxed Mac App Store app, you need the `keychain-access-groups` entitlement. This is not an issue for direct distribution (non-sandboxed).

### Consent Screen Verification
For production, Google requires OAuth consent screen verification if the app serves >100 users. This involves a review process that can take several weeks.

---

## Recommendations for Production (CAL-2)

1. **Use the same architecture** — system browser + localhost redirect + PKCE
2. **Dynamic port selection** — try ports 19847-19857, use whichever is free
3. **Store tokens keyed by account** — `keyring` entry key should include the user's email
4. **Consider `tauri-plugin-oauth`** — there is a community Tauri plugin for OAuth that wraps this pattern, but it may not support PKCE. Worth evaluating vs. rolling our own.
5. **Implement proper error UI** — user-friendly messages for consent denied, network errors, token expired
6. **Separate the Calendar API client** — the `calendar.rs` module here is minimal; production should implement the full `CalendarProvider` trait from CAL-1

---

## File Structure

```
spikes/ts-5-google-oauth/
├── src-tauri/
│   └── src/
│       ├── lib.rs         # Tauri commands: start_auth, fetch_events, etc.
│       ├── oauth.rs       # PKCE generation, auth URL, code exchange, token refresh
│       ├── keychain.rs    # OS keychain storage via keyring crate
│       └── calendar.rs    # Google Calendar API client
├── src/
│   ├── App.tsx            # React UI: connect button, event list
│   └── App.css            # Minimal styling
└── FINDINGS.md            # This document
```
