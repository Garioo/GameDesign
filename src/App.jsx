// App.jsx — root: view routing, ⌘K quick-find, auth gate
import React, { useState, useEffect } from "react";
import { TopHeader, BottomNav, QuickFind } from "./Chrome.jsx";
import { Home } from "./Home.jsx";
import { Doc } from "./Doc.jsx";
import { Canvas } from "./Canvas.jsx";
import { Board } from "./Board.jsx";
import { Table } from "./Table.jsx";
import { useEWStore, store } from "./store.js";
import { SignIn } from "./SignIn.jsx";
import { Start, Splash } from "./Start.jsx";
import { useSession, signOut } from "./supabase.js";

const THEME = {
  accent: "#f0712c",
  radius: "22px",
  density: "comfortable",
  fontDisplay: "'Space Grotesk', system-ui, sans-serif",
  fontUi: "'Hanken Grotesk', system-ui, sans-serif",
};

export function App() {
  const [view, setView] = useState("home");
  const [pageId, setPageId] = useState("ember");
  const statuses = useEWStore((s) => s.statuses);
  const [qf, setQf] = useState(false);
  const { session, loading } = useSession();
  const [guest, setGuest] = useState(false);
  const [entered, setEntered] = useState(false);
  const [booting, setBooting] = useState(true);
  const authed = Boolean(session) || guest;
  const account = session ? session.user.email : "Guest";

  const openPage = (id) => { setPageId(id); setView("doc"); setQf(false); };
  const setStatus = (id, v) => store.setStatus(id, v);
  const onSignOut = async () => { await signOut(); setGuest(false); setEntered(false); };
  const enterWorkspace = (id) => { if (id) openPage(id); else setView("home"); setEntered(true); };

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setQf(o => !o); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="app-bg" data-density={THEME.density} style={{
      "--accent": THEME.accent, "--radius": THEME.radius,
      "--font-display": THEME.fontDisplay, "--font-ui": THEME.fontUi,
      height: "100vh", display: "flex", flexDirection: "column", position: "relative", isolation: "isolate" }}>

      {(booting || loading) ? (
        <Splash />
      ) : !authed ? (
        <SignIn onGuest={() => setGuest(true)} />
      ) : !entered ? (
        <Start account={account} onSignOut={onSignOut}
          onEnter={() => enterWorkspace()} onOpenPage={(id) => enterWorkspace(id)} />
      ) : (
        <>
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <TopHeader view={view} page={pageId} onNav={setView}
              account={session ? session.user.email : "Guest"} onSignOut={onSignOut} />
            <main style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {view === "home" && <Home onOpenPage={openPage} setStatus={setStatus} />}
              {view === "doc" && <Doc pageId={pageId} onOpenPage={openPage} statuses={statuses} setStatus={setStatus} />}
              {view === "canvas" && <Canvas onOpenPage={openPage} statuses={statuses} />}
              {view === "board" && <Board onOpenPage={openPage} />}
              {view === "table" && <Table onOpenPage={openPage} statuses={statuses} setStatus={setStatus} />}
            </main>
          </div>

          <BottomNav view={view} onNav={setView} onSearch={() => setQf(true)} onNew={() => setQf(true)} />
          <QuickFind open={qf} onClose={() => setQf(false)} onOpenPage={openPage} />
        </>
      )}
    </div>
  );
}
