# Google Drive picker and embedded documents

In a page, type `/` and select **Google Drive**. Click **Choose from Google
Drive**, authorize your Google account, then search or browse and select a
Google Doc, Sheet, Slide deck, or PDF. It becomes an embedded block. Use the
height slider to resize it, **Replace** to choose another file, or **Open
original** to open Google's full editor. The block menu supports duplication
and deletion like other blocks. Viewers can see the embed but cannot replace it.

The picker requests `drive.file`: access to files the user selects, using
Google Identity Services. The app does not list the entire Drive through its
own API or store Google access tokens. OAuth tokens exist only during the
picker operation. Only the chosen ID, title, MIME type, resource key (if any),
and embed height are stored in the existing block JSON and shared with the
workspace. No database migration is needed for this block type.

## Google Cloud setup

The Google sign-in configuration in Supabase authenticates app users. This
browser picker also needs public Google Cloud configuration. Use the same
Cloud project for all three values:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: OAuth client ID for a **Web application**.
- `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`: restricted browser API key.
- `NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER`: numeric project number, not project ID.

Enable **Google Picker API** and **Google Drive API**. Configure the consent
screen for `https://www.googleapis.com/auth/drive.file`; add test users if the
OAuth app is in Testing. Add `https://game-design-two.vercel.app` to the OAuth
client's **Authorized JavaScript origins**, plus any custom domain and local
origin used for development (including its port).

Restrict the API key to Google Picker API (and Drive API if enabled for this
key). Under website restrictions include the app's allowed origins with `/*`
and `https://docs.google.com/*`, as required by Google's current Picker guide.
Do not put an OAuth client secret in a `NEXT_PUBLIC_` variable.

Set the three values in Vercel for the relevant environment and in `.env.local`
for development, then rebuild/redeploy. Existing Supabase sign-in redirect URIs
remain configured as before. No OAuth redirect route is needed for this popup
access-token flow.

## Access and previews

Selection does not change document permissions or publish it. Other workspace
members still need access granted by the document owner. Google sessions and
browser third-party-cookie policies affect private iframe previews. The app
cannot inspect the cross-origin iframe to determine whether Google is showing
a document or a sign-in screen; the **Open original** link remains available.
Google's picker can be blocked by popup or network restrictions; the block
reports cancellation, denied access and loader failures without losing content.

## Sources

- [Google Picker web integration](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)

## Verification

Run `node --test tests/*.test.cjs` and `npm run build`. Browser tests can use
intercepted Google scripts and Supabase responses to exercise selection,
cancellation, denied consent and saved block reloads. Real account authorization
and iframe access must be checked after the Cloud credentials are configured.
