# TS-6: Microsoft Graph OAuth2 Spike — Findings

**Date:** 2026-02-19
**Status:** Complete
**Author:** ms-cal agent (Claude Opus 4.6)

---

## Summary

This spike validates that Microsoft Graph OAuth2 authorization code flow with PKCE works in a Tauri 2 desktop app **without MSAL** (Microsoft Authentication Library). The approach uses raw HTTP requests against the Azure AD v2.0 endpoints, PKCE for security, a localhost redirect to capture the auth code, and the `keyring` crate for OS keychain token storage.

**Verdict: This approach works.** No MSAL dependency is needed.

---

## Azure AD (Entra ID) App Registration

### Steps to Register

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **"New registration"**
3. Fill in:
   - **Name:** `LightTime` (or `LightTime Dev` for development)
   - **Supported account types:** Select **"Accounts in any organizational directory and personal Microsoft accounts"**
     - This enables both work/school (Azure AD) and personal (outlook.com, hotmail.com, live.com) accounts
     - The tenant value is `common` in the OAuth URLs
   - **Redirect URI:**
     - Platform: **Mobile and desktop applications** (NOT "Web")
     - URI: `http://localhost:27891/callback`
4. Click **Register**
5. Copy the **Application (client) ID** — this is the `CLIENT_ID` used in the code
6. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**:
   - `Calendars.Read`
   - `offline_access` (for refresh tokens)
   - `User.Read` (added by default — can be removed if not needed)
7. **No client secret is needed** — this is a public client using PKCE

### Important Registration Notes

- **Platform must be "Mobile and desktop applications"**, NOT "Web". The Web platform requires a client secret for token exchange, but PKCE-based public clients on the mobile/desktop platform do not.
- The `offline_access` scope is required to get a refresh token. Without it, the user must re-authenticate every time the access token expires (~1 hour).
- Admin consent is NOT required for `Calendars.Read` or `offline_access` on personal accounts. Work/school accounts may require admin consent depending on the organization's policies.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Tauri App (Rust backend + React frontend)        │
│                                                  │
│  1. User clicks "Sign in with Microsoft"         │
│     → Frontend calls invoke("start_auth")        │
│                                                  │
│  2. Rust generates PKCE verifier + challenge     │
│     → Builds authorization URL                   │
│     → Starts localhost HTTP server on :27891      │
│     → Opens system browser via `open` crate      │
│                                                  │
│  3. User authenticates in browser                │
│     → Microsoft redirects to localhost:27891      │
│     → Rust captures auth code from query params  │
│     → Shows success page in browser              │
│                                                  │
│  4. Rust exchanges code for tokens               │
│     → POST to token endpoint with PKCE verifier  │
│     → Receives access_token + refresh_token      │
│     → Stores tokens in OS keychain (keyring)     │
│                                                  │
│  5. Frontend calls invoke("fetch_calendar_events")│
│     → Rust reads tokens from keychain            │
│     → GET /me/calendarView with Bearer token     │
│     → Returns events to frontend                 │
│                                                  │
│  6. Token refresh (automatic on 401)             │
│     → POST to token endpoint with refresh_token  │
│     → Updates stored tokens in keychain          │
└──────────────────────────────────────────────────┘
```

---

## Key Technical Decisions

### 1. PKCE Without MSAL

**Decision:** Use raw HTTP against Azure AD v2.0 endpoints instead of MSAL.

**Rationale:**
- MSAL for Rust does not exist. MSAL is available for .NET, Java, Python, JS/Node.
- The Azure AD v2.0 endpoints support standard OAuth2 authorization code + PKCE, which is language-agnostic.
- Using raw HTTP keeps the dependency tree minimal and avoids pulling in a large SDK.

**Validation:** The spike successfully completes the full OAuth2 flow with PKCE using only `reqwest` for HTTP and `sha2`/`base64`/`rand` for PKCE generation.

### 2. Localhost Redirect Capture

**Decision:** Use `tiny_http` to run a temporary HTTP server on `localhost:27891` to capture the authorization code.

**Alternatives considered:**
- **Custom URI scheme** (e.g., `lighttime://callback`): Requires platform-specific registration and doesn't work consistently in Tauri 2 across macOS and Windows. The `tauri-plugin-deep-link` plugin could help but adds complexity.
- **Loopback redirect** (what we chose): Simple, works on all platforms, recommended by Microsoft for desktop apps.

**Trade-offs:**
- Port `27891` could theoretically be in use. A production implementation should try a few ports and use the first available.
- The redirect server runs only during the auth flow (max 120 seconds), then shuts down.

### 3. Token Storage in OS Keychain

**Decision:** Use the `keyring` crate (v3) to store tokens in the OS keychain.

**Behavior:**
- **macOS:** Stores in Keychain Access under service `com.lighttime.spike-ms-oauth`
- **Windows:** Stores in Windows Credential Manager
- **Linux:** Uses Secret Service API (GNOME Keyring / KWallet)

**Validation:** Tokens are successfully stored and retrieved across app restarts.

### 4. Token as Single JSON Blob

**Decision:** Store the entire `TokenResponse` (access token + refresh token) as a single JSON string in one keychain entry.

**Rationale:** Simpler than managing multiple keychain entries. The keychain entry has key `ms_tokens` under service `com.lighttime.spike-ms-oauth`.

### 5. The "common" Tenant

**Decision:** Use `https://login.microsoftonline.com/common/oauth2/v2.0/` endpoints.

**Behavior:**
- `common` = accepts both personal Microsoft accounts AND work/school (Azure AD) accounts
- `organizations` = only work/school accounts
- `consumers` = only personal accounts
- `{tenant-id}` = only a specific organization

For LightTime, `common` is correct since we want to support all account types.

---

## API Usage: calendarView Endpoint

The Microsoft Graph `calendarView` endpoint is the correct one for our use case:

```
GET /me/calendarView?startDateTime={start}&endDateTime={end}
```

Key behaviors:
- Returns **expanded recurring events** (unlike `/me/events` which returns the series master)
- Requires `startDateTime` and `endDateTime` query parameters (ISO 8601)
- Supports `$top`, `$orderby`, `$filter`, `$select` OData parameters
- The `Prefer: outlook.timezone="UTC"` header ensures consistent timezone handling
- Maximum 1000 events per page (with `@odata.nextLink` for pagination)

For LightTime's 60-second polling:
- Query for events in the next 24 hours (or 7 days with caching)
- Use `$select=subject,start,end,isAllDay` to minimize response size
- Use `$top=50` since users rarely have more than 50 events in a day

---

## Token Refresh

### Access Token Lifetime
- Default: **1 hour** (3600 seconds)
- The `expires_in` field in the token response confirms this

### Refresh Token Lifetime
- Personal accounts: **24 hours** (sliding window, extended on use)
- Work/school accounts: **90 days** (configurable by admin)
- If not used within the window, user must re-authenticate

### Refresh Implementation
The spike implements automatic token refresh:
1. When `fetch_calendar_events` gets a 401 response, it calls `refresh_token`
2. `refresh_token` reads the stored refresh token from keychain
3. POSTs to the token endpoint with `grant_type=refresh_token`
4. Stores the new token pair in keychain
5. Retries the original request

**For production:** The Calendar Aggregator's 60-second polling loop should proactively refresh the token before it expires (e.g., at the 50-minute mark) rather than waiting for a 401.

---

## Personal vs. Work/School Account Differences

| Aspect | Personal (outlook.com) | Work/School (Azure AD) |
|--------|----------------------|----------------------|
| Tenant in URL | `common` or `consumers` | `common` or `organizations` or `{tenant-id}` |
| Admin consent for Calendars.Read | Not required | May be required by org policy |
| Refresh token lifetime | 24 hours (sliding) | 90 days (configurable) |
| calendarView behavior | Works identically | Works identically |
| Multiple calendars | Supported | Supported |
| Shared calendars | Limited | Full support |
| Conditional Access policies | N/A | May block token issuance |

### Known Limitations for Work/School Accounts
- If the organization has **Conditional Access policies** (e.g., "only allow sign-in from managed devices"), the OAuth flow may fail. There's nothing the app can do about this — the user would see an error in the browser.
- Some organizations **require admin consent** for `Calendars.Read`. In this case, the user sees a "Need admin approval" screen. The app should display a helpful error message.
- Organizations can **block third-party app registrations** entirely. Again, nothing the app can do — document this as a limitation.

---

## Crate Versions and Compatibility

| Crate | Version | Purpose |
|-------|---------|---------|
| `reqwest` | 0.12 | HTTP client for token exchange and Graph API |
| `keyring` | 3 | OS keychain token storage |
| `sha2` | 0.10 | PKCE code challenge (SHA-256) |
| `base64` | 0.22 | PKCE base64url encoding |
| `rand` | 0.8 | PKCE random byte generation |
| `url` | 2 | URL parsing for redirect callback |
| `urlencoding` | 2 | URL encoding for query parameters |
| `chrono` | 0.4 | Date/time for calendarView range |
| `open` | 5 | Open system browser |
| `tiny_http` | 0.12 | Temporary localhost redirect server |
| `serde` / `serde_json` | 1 | JSON serialization |

All crates are well-maintained and compatible with Tauri 2.

---

## Recommendations for Production (CAL-3)

1. **Port selection:** Try ports 27891-27899 and use the first available. Store the chosen port in the authorization state to validate the redirect.

2. **Proactive token refresh:** Refresh the access token at ~50 minutes instead of waiting for 401. The polling loop already runs every 60 seconds — add a token expiry check.

3. **Error UX:** When Azure AD returns an error (admin consent required, conditional access blocked, etc.), display a user-friendly message in the settings window with guidance.

4. **Multi-account support:** The current spike stores a single token set. Production should support multiple Microsoft accounts (e.g., personal + work) by keying the keychain entry on the user's email/UPN.

5. **Logout:** Consider calling the Microsoft logout endpoint (`https://login.microsoftonline.com/common/oauth2/v2.0/logout`) in addition to deleting local tokens, so the browser session is cleared.

6. **Calendar selection:** After authentication, call `GET /me/calendars` to let the user choose which calendars to display. The calendarView endpoint returns events from all calendars by default, but users may want to exclude some.

7. **Incremental sync:** For efficient polling, use the `$deltatoken` mechanism (delta query) to only fetch changes since the last sync, rather than re-fetching all events every 60 seconds.

8. **Rate limiting:** Microsoft Graph has rate limits (typically 10,000 requests per 10 minutes per app per tenant). With 60-second polling, we're well within limits, but implement exponential backoff on 429 responses.

---

## Files

| File | Purpose |
|------|---------|
| `src-tauri/src/oauth.rs` | Full OAuth2 + PKCE implementation, token storage, Graph API calls |
| `src-tauri/src/lib.rs` | Tauri command registration |
| `src/App.tsx` | Test UI: sign in, fetch events, refresh token, sign out |
| `src/App.css` | Minimal styling |
| `FINDINGS.md` | This document |

---

## Conclusion

Microsoft Graph OAuth2 with PKCE works well in Tauri 2 without MSAL. The implementation is straightforward (~250 lines of Rust) and uses standard OAuth2 patterns. The `keyring` crate provides reliable cross-platform keychain storage. The `calendarView` endpoint returns the data we need in the format we need it.

**No blockers identified for CAL-3 (Microsoft Calendar Provider) implementation.**
