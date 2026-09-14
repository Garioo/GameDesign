import { DRIVE_MIME_TYPES, normalizeDriveFile, type DriveFile } from './googleDriveFile';

declare const gapi: { load(name: string, options: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }): void };

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
const appId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;
let loading: Promise<void> | undefined;
export function isDrivePickerConfigured(): boolean { return !!(clientId && apiKey && appId); }
function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    const timer = setTimeout(() => { element.remove(); reject(new Error('Google Drive took too long to load. Try again.')); }, 15000);
    element.src = src; element.async = true;
    element.onload = () => { clearTimeout(timer); resolve(); };
    element.onerror = () => { clearTimeout(timer); element.remove(); reject(new Error('Could not load Google Drive. Check your connection and try again.')); };
    document.head.appendChild(element);
  });
}
/** Load before the click so OAuth opens directly from the user gesture. */
export function prepareDrivePicker(): Promise<void> {
  if (!isDrivePickerConfigured()) return Promise.reject(new Error('Google Drive needs to be configured by the workspace administrator.'));
  if (!loading) {
    loading = Promise.all([
      typeof google !== 'undefined' && google.accounts?.oauth2 ? Promise.resolve() : script('https://accounts.google.com/gsi/client'),
      typeof gapi !== 'undefined' ? Promise.resolve() : script('https://apis.google.com/js/api.js'),
    ]).then(() => new Promise<void>((resolve, reject) => {
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google file picker.')), timeout: 15000, ontimeout: () => reject(new Error('The Google file picker timed out. Try again.')) });
    })).catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

/** Access tokens stay in this operation's closure, never in storage or page blocks. */
export function pickDriveFile(onPick: (file: DriveFile) => void, onFinish: (error?: Error) => void): () => void {
  let done = false;
  let picker: google.picker.Picker | undefined;
  function finish(error?: Error) {
    if (done) return;
    done = true; picker?.dispose(); onFinish(error);
  }
  try {
    if (!isDrivePickerConfigured()) throw new Error('Google Drive needs to be configured by the workspace administrator.');
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId!, scope: SCOPE, include_granted_scopes: false,
      callback: response => {
        if (done) return;
        if (response.error || !response.access_token) { finish(new Error('Google Drive access was not granted. Please try again.')); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) { finish(new Error('Allow access to selected Drive files to use the picker.')); return; }
        try {
          const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(Object.keys(DRIVE_MIME_TYPES).join(','));
          picker = new google.picker.PickerBuilder().addView(view).setTitle('Choose a document to embed')
            .setOAuthToken(response.access_token).setDeveloperKey(apiKey!).setAppId(appId!)
            .setOrigin(window.location.origin)
            .setCallback(data => {
              if (done) return;
              if (data.action === google.picker.Action.CANCEL) { finish(); return; }
              if (data.action !== google.picker.Action.PICKED) return;
              try {
                const doc = data.docs?.[0];
                if (!doc) throw new Error('No document was selected.');
                let resourceKey: string | undefined = doc.resourceKey;
                try { resourceKey ??= new URL(doc.url ?? '').searchParams.get('resourcekey') ?? undefined; } catch { /* optional */ }
                onPick(normalizeDriveFile({ id: doc.id, name: doc.name, mimeType: doc.mimeType, resourceKey }));
                finish();
              } catch (error) { finish(error instanceof Error ? error : new Error('Could not select the document.')); }
            }).build();
          picker.setVisible(true);
        } catch (error) { finish(error instanceof Error ? error : new Error('Could not open Google Drive.')); }
      },
      error_callback: error => finish(new Error(error.type === 'popup_closed' ? 'Google sign-in was closed. You can try again.' : 'Google sign-in could not open. Allow popups for this site and try again.')),
    });
    client.requestAccessToken({ prompt: 'select_account' });
  } catch (error) { finish(error instanceof Error ? error : new Error('Could not connect Google Drive.')); }
  return () => { done = true; picker?.dispose(); };
}
