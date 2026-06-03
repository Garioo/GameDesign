// Home.jsx — dashboard / home view
import React from "react";
import { Icon, Avatar, AvStack, StatusPill, Ring } from "./ui.jsx";
import { data } from "./data.js";

export function Home({ onOpenPage, setStatus }) {
  const { game, sections, activity, milestones, team, sectionPrimary } = data;
  const open = (sec) => onOpenPage(sectionPrimary[sec] || "ember");
  const nextMs = milestones.find(m => m.status === "wip") || milestones[0];

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 36px 140px" }}>

        {/* hero */}
        <section className="row between rise" style={{ alignItems: "flex-end", gap: 28, marginBottom: 34 }}>
          <div style={{ minWidth: 0 }}>
            <div className="row g10" style={{ marginBottom: 12 }}>
              <span className="eyebrow">{game.genre}</span>
              <span className="tag mono">in production</span>
            </div>
            <h1 className="disp" style={{ fontSize: 76, lineHeight: .92, letterSpacing: "-0.015em", marginBottom: 14 }}>{game.name}</h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 540, margin: 0, lineHeight: 1.45 }}>{game.tagline}</p>
          </div>
          <div className="card" style={{ padding: 20, display: "flex", gap: 18, alignItems: "center", flex: "none" }}>
            <Ring value={game.progress} size={104} stroke={10} label="complete" />
            <div className="col g10" style={{ paddingRight: 6 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 3 }}>Next milestone</div>
                <div className="row g8"><Icon name="flag" size={15} style={{ color: "var(--accent)" }} /><span style={{ fontWeight: 600, fontSize: 15 }}>{nextMs.name}</span></div>
                <div className="faint" style={{ fontSize: 13 }}>{nextMs.date}</div>
              </div>
              <div className="hr" />
              <div className="row g6"><AvStack ids={["AK","MR","JO","LP","TS"]} size={26} /><span className="faint" style={{ fontSize: 12.5 }}>5 contributors</span></div>
            </div>
          </div>
        </section>

        {/* KPI strip */}
        <section className="rise" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--gap)", marginBottom: "var(--gap)", animationDelay: ".05s" }}>
          {[["Overall progress", game.progress + "%", "+6% this week"],
            ["Open tasks", "38", "12 due this sprint"],
            ["Pages", "57", "across 10 sections"],
            ["Days to slice", "28", "Vertical slice · Jun 30"]].map(([k,v,sub]) => (
            <div key={k} className="card" style={{ padding: "16px 18px" }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{k}</div>
              <div className="disp" style={{ fontSize: 40, lineHeight: 1 }}>{v}</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{sub}</div>
            </div>
          ))}
        </section>

        {/* main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: "var(--gap)" }}>

          {/* sections */}
          <section className="card rise" style={{ padding: "var(--pad)", animationDelay: ".1s" }}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <div className="row g10"><h2 className="disp" style={{ fontSize: 26 }}>Sections</h2><span className="tag mono">10</span></div>
              <button className="btn ghost sm"><Icon name="filter" size={15} />All</button>
            </div>
            <div className="col" style={{ gap: 2 }}>
              {sections.map(s => (
                <div key={s.id} onClick={() => open(s.id)} className="row g14" style={{ padding: "var(--row) 10px", borderRadius: 12, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, flex: "none", display: "grid", placeItems: "center",
                    background: `color-mix(in srgb, ${s.color} 13%, var(--surface))`, color: s.color }}>
                    <Icon name={s.icon} size={19} /></span>
                  <div className="grow">
                    <div className="row g8"><span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</span>
                      <span className="faint mono" style={{ fontSize: 11.5 }}>{s.count} pages</span></div>
                    <div className="bar" style={{ marginTop: 7, maxWidth: 320 }}><i style={{ width: s.prog + "%", background: s.color }} /></div>
                  </div>
                  <span className="faint mono" style={{ fontSize: 12.5, width: 34, textAlign: "right" }}>{s.prog}%</span>
                  <span style={{ width: 96, display: "flex", justifyContent: "flex-end" }}><StatusPill value={s.status} editable={false} /></span>
                  <Icon name="chev" size={16} style={{ color: "var(--ink-3)" }} />
                </div>
              ))}
            </div>
          </section>

          {/* right rail */}
          <div className="col" style={{ gap: "var(--gap)" }}>

            <section className="card rise" style={{ padding: "var(--pad)", animationDelay: ".15s" }}>
              <h2 className="disp" style={{ fontSize: 22, marginBottom: 14 }}>Recent activity</h2>
              <div className="col" style={{ gap: 4 }}>
                {activity.map((a, i) => (
                  <div key={i} onClick={() => onOpenPage(a.page)} className="row g10" style={{ padding: "9px 8px", borderRadius: 10, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar id={a.who} size={28} ring={false} />
                    <div className="grow" style={{ fontSize: 13.5, lineHeight: 1.35 }}>
                      <span style={{ fontWeight: 600 }}>{team[a.who].name.split(" ")[0]}</span>
                      <span className="muted"> {a.action} </span>
                      <span style={{ fontWeight: 600, color: "var(--accent-ink)" }}>{a.target}</span>
                      {a.chip && <span className="tag" style={{ marginLeft: 6, padding: "1px 7px", fontSize: 11 }}>{a.chip}</span>}
                    </div>
                    <span className="faint mono" style={{ fontSize: 11.5, flex: "none" }}>{a.when}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card rise" style={{ padding: "var(--pad)", animationDelay: ".2s" }}>
              <h2 className="disp" style={{ fontSize: 22, marginBottom: 14 }}>Milestones</h2>
              <div className="col" style={{ gap: 2 }}>
                {milestones.map((m, i) => (
                  <div key={i} className="row g10" style={{ padding: "9px 4px" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center",
                      background: m.status === "done" ? "var(--st-done-bg)" : m.status === "wip" ? "var(--accent-soft)" : "var(--surface-2)",
                      color: m.status === "done" ? "var(--st-done)" : m.status === "wip" ? "var(--accent)" : "var(--ink-3)" }}>
                      <Icon name={m.status === "done" ? "check" : "flag"} size={14} /></span>
                    <span className="grow" style={{ fontWeight: 600, fontSize: 14, color: m.status === "todo" ? "var(--ink-2)" : "var(--ink)" }}>{m.name}</span>
                    <span className="faint mono" style={{ fontSize: 12.5 }}>{m.date}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card rise" style={{ padding: "var(--pad)", animationDelay: ".25s" }}>
              <h2 className="disp" style={{ fontSize: 22, marginBottom: 14 }}>Team</h2>
              <div className="col" style={{ gap: 2 }}>
                {Object.values(team).map(m => (
                  <div key={m.id} className="row g10" style={{ padding: "7px 4px" }}>
                    <Avatar id={m.id} size={30} ring={false} />
                    <div className="grow"><div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>{m.role}</div></div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
