import AuthHashRedirect from "./AuthHashRedirect";
import Link from "next/link";
import styles from "./landing.module.css";

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const ArrowRight = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Check = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);
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
const Branch = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M6 9v6M18 9a9 9 0 0 1-9 9" />
  </svg>
);
const CanvasArrow = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 38 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4c12 2 22 8 30 18" strokeDasharray="3 4" />
    <path d="m26 20 6 2 .5-6.5" />
  </svg>
);

const FEATURES = [
  {
    icon: <Doc />,
    title: "Living docs",
    body: "A block editor built for design docs — slash commands, tables, statuses and inline comments that keep specs current.",
  },
  {
    icon: <Shapes />,
    title: "Infinite canvas",
    body: "Sketch systems, flows and level layouts on a shared canvas that lives right next to the words.",
  },
  {
    icon: <Columns />,
    title: "Production board",
    body: "Turn decisions into work. Track every feature from idea to shipped on the team board.",
  },
  {
    icon: <Branch />,
    title: "GitHub-aware",
    body: "Script blocks read straight from your repositories, so the doc never drifts from the build.",
  },
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <AuthHashRedirect />
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Flame className={styles.logoIcon} />
          </span>
          <span className={styles.brandName}>GAME DESIGN DOC</span>
        </div>
        <Link href="/login" className={styles.signIn}>
          Sign in
        </Link>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Game Design System</p>
          <h1 className={styles.title}>
            Where your game <span className={styles.titleAccent}>takes shape</span>.
          </h1>
          <p className={styles.lede}>
            Your team&apos;s living game design document — docs, canvases and
            boards that stay in step with each other, and with the build.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/login" className={styles.ctaPrimary}>
              Start designing
              <ArrowRight className={styles.ctaArrow} />
            </Link>
            <span className={styles.ctaNote}>Sign in with Google or GitHub</span>
          </div>
        </div>

        {/* decorative product mock — hidden from assistive tech */}
        <div className={styles.mock} aria-hidden="true">
          <div className={styles.docCard}>
            <p className={styles.docCrumb}>Systems · Combat</p>
            <div className={styles.docHead}>
              <span className={styles.docTitle}>Stamina &amp; posture</span>
              <span className={styles.statusPill}>In review</span>
            </div>
            <div className={styles.docBody}>
              <span className={`${styles.line} ${styles.lineW95}`} />
              <span className={`${styles.line} ${styles.lineW80}`} />
              <div className={styles.check}>
                <span className={`${styles.checkbox} ${styles.checkboxDone}`}>
                  <Check />
                </span>
                <span className={styles.checkDone}>Dodging costs stamina</span>
              </div>
              <div className={styles.check}>
                <span className={styles.checkbox} />
                <span>Posture breaks open a riposte window</span>
              </div>
              <span className={`${styles.line} ${styles.lineW60}`} />
            </div>
            <div className={styles.docFoot}>
              <div className={styles.avatars}>
                <span className={`${styles.avatar} ${styles.avatarA}`}>MQ</span>
                <span className={`${styles.avatar} ${styles.avatarB}`}>MA</span>
                <span className={`${styles.avatar} ${styles.avatarC}`}>JT</span>
              </div>
              <span className={styles.savedNote}>
                <span className={styles.savedDot} />
                Saved just now
              </span>
            </div>
          </div>

          <div className={styles.canvasCard}>
            <p className={styles.canvasLabel}>Canvas</p>
            <div className={styles.canvasField}>
              <span className={`${styles.sticky} ${styles.stickyA}`} />
              <CanvasArrow className={styles.canvasArrow} />
              <span className={`${styles.sticky} ${styles.stickyB}`} />
              <span className={`${styles.sticky} ${styles.stickyC}`} />
            </div>
          </div>

          <div className={styles.comment}>
            <span className={styles.commentAvatar}>MA</span>
            <p className={styles.commentBody}>
              <span className={styles.commentName}>Maja</span>
              Should parrying refund stamina instead?
            </p>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map((f) => (
          <article key={f.title} className={styles.feature}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <h2 className={styles.featureTitle}>{f.title}</h2>
            <p className={styles.featureBody}>{f.body}</p>
          </article>
        ))}
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>GAME DESIGN DOC</span>
        <span>The team&apos;s living game design documents.</span>
      </footer>
    </div>
  );
}
