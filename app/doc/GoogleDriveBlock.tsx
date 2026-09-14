"use client";

import { useEffect, useRef, useState } from 'react';
import { DRIVE_MIME_TYPES, driveFileUrls, normalizeDriveFile, type DriveFile } from '@/lib/googleDriveFile';
import { isDrivePickerConfigured, pickDriveFile, prepareDrivePicker } from '@/lib/googleDrivePicker';
import './google-drive.css';

export default function GoogleDriveBlock({ file, onChange, readOnly }: {
  file?: DriveFile; onChange: (file: DriveFile) => void; readOnly: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = useRef<(() => void) | undefined>(undefined);
  const alive = useRef(true);
  const change = useRef(onChange); change.current = onChange;
  let valid: DriveFile | undefined;
  try { if (file) valid = normalizeDriveFile(file); } catch { /* show a replaceable placeholder */ }
  const urls = valid ? driveFileUrls(valid) : undefined;
  useEffect(() => {
    alive.current = true;
    if (!readOnly && isDrivePickerConfigured()) {
      prepareDrivePicker().then(() => { if (alive.current) setReady(true); })
        .catch(e => { if (alive.current) setError(e.message); });
    }
    return () => { alive.current = false; cancel.current?.(); };
  }, [readOnly]);
  function choose() {
    if (readOnly || busy) return;
    setError(''); setBusy(true);
    cancel.current = pickDriveFile(file => { if (alive.current) change.current(file); }, error => {
      if (!alive.current) return;
      setBusy(false); if (error) setError(error.message);
    });
  }
  function retry() {
    setError('');
    prepareDrivePicker().then(() => { if (alive.current) setReady(true); })
      .catch(e => { if (alive.current) setError(e.message); });
  }
  return <section className="drive-block" contentEditable={false} aria-label="Google Drive document">
    <div className="drive-block-header">
      <div><strong>{valid?.name || 'Embed from Google Drive'}</strong><span>{valid ? DRIVE_MIME_TYPES[valid.mimeType].label : 'Search your account and choose a document'}</span></div>
      <div className="drive-block-actions">
        {urls && <a href={urls.original} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
        {!readOnly && <button type="button" disabled={!ready || busy} onClick={choose}>{busy ? 'Choosing…' : valid ? 'Replace' : 'Choose from Google Drive'}</button>}
      </div>
    </div>
    {!readOnly && !isDrivePickerConfigured() && <p className="drive-block-message">Google Drive is not connected to this app yet. Ask the app administrator to enable the Google Drive picker.</p>}
    {!readOnly && isDrivePickerConfigured() && !ready && !error && <p className="drive-block-message" role="status">Loading Google Drive…</p>}
    {error && <p className="drive-block-message drive-block-error" role="alert">{error} {!ready && <button type="button" onClick={retry}>Retry</button>}</p>}
    {urls && valid ? <>
      <iframe key={urls.embed} src={urls.embed} title={valid.name} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ height: valid.height }} />
      <div className="drive-block-footer"><span>Access follows Google sharing settings. If the preview asks you to sign in, open the original document.</span>
        {!readOnly && <label>Height <input aria-label="Google document height" type="range" min={320} max={1200} step={40} value={valid.height} onChange={e => onChange({ ...valid!, height: Number(e.target.value) })} /></label>}
      </div>
    </> : <p className="drive-block-message">{readOnly ? 'No document selected yet.' : 'Browse Google Docs, Sheets, Slides and PDFs. Google will ask for access when you connect.'}</p>}
  </section>;
}
