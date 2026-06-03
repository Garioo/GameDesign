// Start.jsx — post-sign-in start screen: welcome + project picker + recent pages
// Plus a small branded boot splash exported for App's loading state.
import React from "react";
import { Icon, Avatar, AvStack, Ring } from "./ui.jsx";
import { data } from "./data.js";

/* branded splash shown while the session resolves */
export function Splash() {
  return (
    <div className="splash">
      <span className="splash-logo"><Icon name="flame" size={30} stroke={1.7} /></span>
      <div className="splash-word">EMBERWICK</div>
      <div className="splash-bar"><i /></div>
    </div>
  );
}

function greetName(account) {
  if (!account || account === "Guest") return "there";
  const local = String(account).split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

export function Start({ account, onSignOut, onEnter, onOpenPage }) {
  const { game, sections, activity, team, pages } = data;
  const totalPages = Object.keys(pages).length;
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="start">
      {/* top bar */}
      <header className="start-bar">
        <div className="row g10">
          <span className="start-mark"><Icon name="flame" size={16} stroke={1.8} /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: ".04em" }}>EMBERWICK</div>
            <div className="faint" style={{ fontSize: 11.5 }}>Game Design System</div>
          </div>
        </div>
        <div className="row g10">
          <span className="faint" style={{ fontSize: 13 }}>{account}</span>
          <button className="btn ghost sm" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <div className="start-inner">
        {/* greeting */}
        <div className="rise" style={{ marginBottom: 30 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{partOfDay}</div>
          <h1 className="disp" style={{ fontSize: 46, lineHeight: 1, letterSpacing: "-0.015em" }}>
            Welcome back, {greetName(account)}.
          </h1>
          <p className="muted" style={{ fontSize: 16, margin: "10px 0 0" }}>Pick up where the team left off.</p>
        </div>

        {/* projects */}
        <section className="rise" style={{ animationDelay: ".05s", marginBottom: 34 }}>
          <div className="start-h">Your projects</div>
          <div className="start-grid">
            {/* live project */}
            <button className="start-proj card" onClick={onEnter}>
              <div className="start-proj-cover">
                <span className="start-proj-flame"><Icon name="flame" size={26} stroke={1.7} /></span>
                <Ring value={game.progress} size={62} stroke={6} />
              </div>
              <div className="start-proj-body">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="start-proj-name">{game.name}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>{game.genre}</div>
                  </div>
                  <span className="tag mono">active</span>
                </div>
                <p className="muted start-proj-tag">{game.tagline}</p>
                <div className="row between">
                  <AvStack ids={["AK", "MR", "JO", "LP"]} size={24} extra={1} />
                  <span className="row g6 start-proj-open">Open <Icon name="arrow" size={15} /></span>
                </div>
              </div>
            </button>

            {/* new project */}
            <button className="start-new" onClick={onEnter}>
              <span className="start-new-plus"><Icon name="plus" size={20} /></span>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>New project</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>Start a fresh design doc</div>
            </button>
          </div>
        </section>

        {/* jump back in */}
        <section className="rise" style={{ animationDelay: ".1s" }}>
          <div className="start-h">Jump back in</div>
          <div className="start-recent">
            {activity.slice(0, 5).map((a, i) => {
              const pg = pages[a.page];
              return (
                <button key={i} className="start-recent-row" onClick={() => onOpenPage(a.page)}>
                  <Avatar id={a.who} size={28} ring={false} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="start-recent-title">{a.target || (pg && pg.title)}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {team[a.who].name.split(" ")[0]} {a.action}
                    </div>
                  </div>
                  <span className="faint mono" style={{ fontSize: 11.5 }}>{a.when}</span>
                  <Icon name="chev" size={15} style={{ color: "var(--ink-3)" }} />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
