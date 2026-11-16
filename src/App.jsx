import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { fetchMyProfile } from "./lib/api";
import { ALL_SITES, ROLES, can } from "./lib/locations";
import { PALETTES, ThemeContext } from "./lib/palette";
import { Brand, Icon, Toast } from "./components/ui";
import SiteTabs from "./components/SiteTabs";
import SignIn from "./screens/SignIn";
import Today from "./screens/Today";
import Record from "./screens/Record";
import Reports from "./screens/Reports";
import Team from "./screens/Team";

/* ── Theme: light unless this device chose dark ────────────────────────── */
const THEME_KEY = "hotzonex-theme-v2";
function readTheme() { try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; } }
function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0F172A" : "#2E3A87");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))];
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);
  const [notice, setNotice] = useState("");
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let live = true;
    fetchMyProfile(session.user.id)
      .then((p) => {
        if (!live) return;
        if (!p || !p.active) {
          setNotice(p ? "Your account has been switched off. Ask the Hotzonex admin to turn it back on."
            : "Your account isn't set up yet. Ask the Hotzonex admin to add you in Team.");
          supabase.auth.signOut();
        } else { setNotice(""); setProfile(p); }
      })
      .catch(() => live && setNotice("Can't load your account. Check your internet connection and sign in again."));
    return () => { live = false; };
  }, [session]);

  // A profile only counts if it belongs to the person signed in right now.
  const current = session && profile?.id === session.user.id ? profile : null;
  let page;
  if (session === undefined || (session && !current && !notice)) {
    page = <main className="signin"><p className="soft" role="status">Opening Hotzonex…</p></main>;
  } else if (!session || !current) {
    page = <SignIn notice={notice} theme={theme} onToggleTheme={toggleTheme} />;
  } else {
    page = <Shell key={current.id} profile={current} theme={theme} onToggleTheme={toggleTheme} />;
  }
  return <ThemeContext.Provider value={PALETTES[theme]}>{page}</ThemeContext.Provider>;
}

function Shell({ profile, theme, onToggleTheme }) {
  const [view, setView] = useState("today");
  const [loc, setLoc] = useState(can(profile, "canViewAll") ? ALL_SITES : profile.location);
  const [recordDate, setRecordDate] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState("");
  const lastFocus = useRef(0);

  // Fresh figures when someone comes back to the app, at most once a minute.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFocus.current > 60000) { lastFocus.current = Date.now(); setReloadKey((k) => k + 1); }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const notify = useCallback((m) => setToast(m), []);
  const clearToast = useCallback(() => setToast(""), []);
  const go = (v) => { setView(v); window.scrollTo(0, 0); };
  const record = (date) => { setRecordDate(date); go("record"); };
  const openView = (id) => (id === "record" ? record(null) : go(id));

  const nav = [
    ["today", "Dashboard", "today"],
    can(profile, "canEdit") && ["record", "Record", "record"],
    ["reports", "Reports", "reports"],
  ].filter(Boolean);
  const signOut = () => supabase.auth.signOut();
  const showSites = view !== "team" && view !== "more";

  const extras = (
    <>
      {can(profile, "canManageUsers") && (
        <button type="button" className="rail-link" aria-current={view === "team" ? "page" : undefined} onClick={() => go("team")}>
          <Icon name="team" />Team
        </button>
      )}
      <button type="button" className="rail-link" onClick={onToggleTheme}>
        <Icon name={theme === "dark" ? "sun" : "moon"} />{theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <button type="button" className="rail-link" onClick={() => { setReloadKey((k) => k + 1); notify("Figures refreshed"); }}><Icon name="refresh" />Refresh figures</button>
      <button type="button" className="rail-link" onClick={signOut}><Icon name="out" />Sign out</button>
    </>
  );

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <Brand />
        <nav>
          {nav.map(([id, label, icon]) => (
            <button key={id} type="button" className="rail-link" aria-current={view === id ? "page" : undefined} onClick={() => openView(id)}>
              <Icon name={icon} />{label}
            </button>
          ))}
        </nav>
        <div className="rail-foot">{extras}</div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <Brand sub={null} />
          {showSites ? <SiteTabs profile={profile} value={loc} onChange={setLoc} /> : <span />}
          <span className="spacer" />
          <div className="me">
            <span className="me-text" style={{ textAlign: "right" }}>
              <span className="me-name" style={{ display: "block" }}>{profile.name}</span>
              <span className="me-role">{ROLES[profile.role]?.label}</span>
            </span>
            <span className="avatar" aria-hidden="true">{profile.name.charAt(0).toUpperCase()}</span>
          </div>
        </header>
        {showSites && <div className="subbar no-print"><SiteTabs profile={profile} value={loc} onChange={setLoc} /></div>}

        <main className="content">
          {view === "today" && <Today profile={profile} loc={loc} reloadKey={reloadKey} onRecord={record} />}
          {view === "record" && (
            <Record key={loc} profile={profile} loc={loc} onPickSite={setLoc} startDate={recordDate} reloadKey={reloadKey} notify={notify} />
          )}
          {view === "reports" && <Reports loc={loc} reloadKey={reloadKey} />}
          {view === "team" && can(profile, "canManageUsers") && <Team profile={profile} notify={notify} />}
          {view === "more" && (
            <div>
              <div className="page-head"><div><h1>More</h1><p>Signed in as {profile.name}, {ROLES[profile.role]?.label.toLowerCase()}.</p></div></div>
              <div className="panel" style={{ display: "grid", gap: 2, padding: "8px 0" }}>{extras}</div>
            </div>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {[...nav, ["more", "More", "more"]].map(([id, label, icon]) => (
          <button key={id} type="button" className="tab"
            aria-current={view === id || (id === "more" && view === "team") ? "page" : undefined}
            onClick={() => openView(id)}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
