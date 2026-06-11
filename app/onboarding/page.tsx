"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession, setActiveWorkspace, PALETTE, type SessionInfo } from "@/lib/session";
import { updateProfile, completeOnboarding } from "@/lib/settingsRepo";
import {
  listWorkspaces,
  createWorkspace,
  createInviteLink,
  type WorkspaceSummary,
} from "@/lib/workspacesRepo";
import styles from "./onboarding.module.css";

/* ---------- inline icon set (matches app/home) ---------- */
type IconProps = { className?: string };

const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Shapes = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <circle cx="17.5" cy="17.5" r="3.5" />
  </svg>
);
const Columns = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18" />
  </svg>
);

const STEPS = ["Profile", "Workspace", "Invite", "Tour"] as const;

const initialsOf = (name: string) => name.trim().slice(0, 2).toUpperCase();

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [existing, setExisting] = useState<WorkspaceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1 — profile
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [color, setColor] = useState(PALETTE[0]);

  // step 2 — workspace (pick an existing one, or create a new one)
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [wsName, setWsName] = useState("");
  const [wsGenre, setWsGenre] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // step 3 — invite
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) {
        router.replace("/login");
        return;
      }
      if (s.onboarded) {
        router.replace("/home");
        return;
      }
      setSession(s);
      setName(s.name);
      setInitials(s.initials);
      setColor(s.color);
      const spaces = await listWorkspaces(s.userId);
      if (cancelled) return;
      setExisting(spaces);
      // Invited users arrive already holding a membership — preselect it.
      setChosenId(spaces[0]?.id ?? null);
      setReady(true);
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const stepValid = useMemo(() => {
    if (step === 0) return name.trim().length > 0 && initials.trim().length > 0;
    if (step === 1) return chosenId !== null || wsName.trim().length > 0;
    return true;
  }, [step, name, initials, chosenId, wsName]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const saveProfile = () =>
    run(async () => {
      if (!session) return;
      await updateProfile(session.userId, {
        name: name.trim(),
        initials: initials.trim().slice(0, 2).toUpperCase(),
        color,
      });
      setStep(1);
    });

  const saveWorkspace = () =>
    run(async () => {
      if (!session) return;
      let id = chosenId;
      if (!id) {
        id = await createWorkspace(session.userId, wsName.trim(), "", wsGenre.trim());
      }
      setActiveWorkspace(id);
      setWorkspaceId(id);
      setStep(2);
    });

  const copyInvite = () =>
    run(async () => {
      if (!session || !workspaceId) return;
      const link = inviteLink ?? (await createInviteLink(workspaceId, session.userId));
      setInviteLink(link);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        /* clipboard blocked — the link stays visible to copy by hand */
      }
    });

  const finish = () =>
    run(async () => {
      if (!session) return;
      await completeOnboarding(session.userId);
      router.replace("/home");
    });

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>{error ?? "One moment…"}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <p className={styles.brand}>EMBERWICK</p>

        <ol className={styles.steps} aria-label="Onboarding progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`${styles.stepDot} ${i === step ? styles.stepCurrent : ""} ${
                i < step ? styles.stepDone : ""
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className={styles.pane} key="profile">
            <h1 className={styles.title}>Who&apos;s designing?</h1>
            <p className={styles.sub}>
              This is how teammates will see you on pages, comments and the board.
            </p>
            <div className={styles.identityRow}>
              <span className={styles.bigAvatar} style={{ background: color }}>
                {initials || "?"}
              </span>
              <div className={styles.fields}>
                <label className={styles.label}>
                  Name
                  <input
                    className={styles.input}
                    value={name}
                    autoFocus
                    maxLength={40}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!initialsTouched) setInitials(initialsOf(e.target.value));
                    }}
                    placeholder="Your name"
                  />
                </label>
                <label className={styles.label}>
                  Initials
                  <input
                    className={`${styles.input} ${styles.inputShort}`}
                    value={initials}
                    maxLength={2}
                    onChange={(e) => {
                      setInitialsTouched(true);
                      setInitials(e.target.value.toUpperCase());
                    }}
                  />
                </label>
              </div>
            </div>
            <div className={styles.swatches} role="radiogroup" aria-label="Avatar color">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  className={`${styles.swatch} ${c === color ? styles.swatchOn : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className={styles.pane} key="workspace">
            <h1 className={styles.title}>
              {existing.length > 0 ? "Choose your workspace" : "Name your workspace"}
            </h1>
            <p className={styles.sub}>
              {existing.length > 0
                ? "You already have a place waiting — or start a fresh one."
                : "A workspace holds one game's docs, canvases and board."}
            </p>
            {existing.length > 0 && (
              <div className={styles.wsOptions}>
                {existing.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`${styles.wsOption} ${chosenId === w.id ? styles.wsOptionOn : ""}`}
                    onClick={() => setChosenId(w.id)}
                  >
                    <span className={styles.wsOptionName}>{w.name}</span>
                    <span className={styles.wsOptionMeta}>
                      {w.memberCount} {w.memberCount === 1 ? "member" : "members"}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.wsOption} ${chosenId === null ? styles.wsOptionOn : ""}`}
                  onClick={() => setChosenId(null)}
                >
                  <span className={styles.wsOptionName}>Create a new one…</span>
                </button>
              </div>
            )}
            {chosenId === null && (
              <div className={styles.fieldsCol}>
                <label className={styles.label}>
                  Workspace name
                  <input
                    className={styles.input}
                    value={wsName}
                    autoFocus={existing.length === 0}
                    maxLength={60}
                    onChange={(e) => setWsName(e.target.value)}
                    placeholder="e.g. Emberwick"
                  />
                </label>
                <label className={styles.label}>
                  Genre <span className={styles.optional}>optional</span>
                  <input
                    className={styles.input}
                    value={wsGenre}
                    maxLength={40}
                    onChange={(e) => setWsGenre(e.target.value)}
                    placeholder="e.g. Action RPG"
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className={styles.pane} key="invite">
            <h1 className={styles.title}>Bring the team</h1>
            <p className={styles.sub}>
              Anyone with this link can join your workspace. It stays valid for 14 days —
              you can always make another from Home.
            </p>
            <button type="button" className={styles.primary} onClick={copyInvite} disabled={busy}>
              {copied ? "Link copied!" : inviteLink ? "Copy link again" : "Create invite link"}
            </button>
            {inviteLink && <code className={styles.linkBox}>{inviteLink}</code>}
          </section>
        )}

        {step === 3 && (
          <section className={styles.pane} key="tour">
            <h1 className={styles.title}>Three places to work</h1>
            <p className={styles.sub}>Everything in your workspace lives in one of these.</p>
            <div className={styles.tour}>
              <div className={styles.tourItem}>
                <span className={styles.tourIcon}><Doc /></span>
                <div>
                  <h2 className={styles.tourName}>Docs</h2>
                  <p className={styles.tourBody}>The living design document — specs, systems and decisions.</p>
                </div>
              </div>
              <div className={styles.tourItem}>
                <span className={styles.tourIcon}><Shapes /></span>
                <div>
                  <h2 className={styles.tourName}>Canvas</h2>
                  <p className={styles.tourBody}>Sketch flows, systems and level layouts together.</p>
                </div>
              </div>
              <div className={styles.tourItem}>
                <span className={styles.tourIcon}><Columns /></span>
                <div>
                  <h2 className={styles.tourName}>Board</h2>
                  <p className={styles.tourBody}>Track features from idea to shipped.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <footer className={styles.footer}>
          {step > 0 ? (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setStep(step - 1)}
              disabled={busy}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step === 0 && (
            <button type="button" className={styles.primary} onClick={saveProfile} disabled={busy || !stepValid}>
              {busy ? "Saving…" : "Continue"}
            </button>
          )}
          {step === 1 && (
            <button type="button" className={styles.primary} onClick={saveWorkspace} disabled={busy || !stepValid}>
              {busy ? "Setting up…" : "Continue"}
            </button>
          )}
          {step === 2 && (
            <button type="button" className={styles.primary} onClick={() => setStep(3)} disabled={busy}>
              {inviteLink ? "Continue" : "Skip for now"}
            </button>
          )}
          {step === 3 && (
            <button type="button" className={styles.primary} onClick={finish} disabled={busy}>
              {busy ? "Opening…" : "Enter your studio"}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
