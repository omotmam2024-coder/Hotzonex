import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { fetchMyProfile } from "./lib/api";
import { ALL_SITES, ROLES, can } from "./lib/locations";
import { Icon, Logo, Toast } from "./components/ui";
import LocationPicker from "./components/LocationPicker";
import SignIn from "./screens/SignIn";
import Today from "./screens/Today";
import Record from "./screens/Record";
import Reports from "./screens/Reports";
import Team from "./screens/Team";

/* ── Theme: system by default, or the choice saved on this device ─────── */
const THEME_KEY = "hotzonex-theme";
function readTheme() { try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; } }
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);
  const [notice, setNotice] = useState("");

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
  if (session === undefined || (session && !current && !notice)) {
    return <main className="signin"><p className="soft" role="status">Opening Hotzonex…</p></main>;
  }
  if (!session || !current) return <SignIn notice={notice} />;
  return <Shell key={current.id} profile={current} />;
}

function Shell({ profile }) {
  const [view, setView] = useState("today");
  const [loc, setLoc] = useState(can(profile, "canViewAll") ? ALL_SITES : profile.location);
  const [recordDate, setRecordDate] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(readTheme);
  const lastFocus = useRef(0);

  useEffect(() => { applyTheme(theme); }, [theme]);

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

  const nav = [
    ["today", "Today", "today"],
    can(profile, "canEdit") && ["record", "Record", "record"],
    ["reports", "Reports", "reports"],
  ].filter(Boolean);
  const cycleTheme = () => setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  const themeLabel = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Match device";
  const signOut = () => supabase.auth.signOut();

  const extras = (
    <>
      {can(profile, "canManageUsers") && (
        <button type="button" className="rail-link" aria-current={view === "team" ? "page" : undefined} onClick={() => go("team")}>
          <Icon name="team" />Team
        </button>
      )}
      <button type="button" className="rail-link" onClick={cycleTheme}><Icon name={theme === "dark" ? "moon" : "sun"} />Theme: {themeLabel}</button>
      <button type="button" className="rail-link" onClick={() => { setReloadKey((k) => k + 1); notify("Figures refreshed"); }}><Icon name="refresh" />Refresh figures</button>
      <button type="button" className="rail-link" onClick={signOut}><Icon name="out" />Sign out</button>
    </>
  );

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><Logo /> Hotzonex</div>
        {nav.map(([id, label, icon]) => (
          <button key={id} type="button" className="rail-link" aria-current={view === id ? "page" : undefined}
            onClick={() => (id === "record" ? record(null) : go(id))}>
            <Icon name={icon} />{label}
          </button>
        ))}
        <div className="rail-foot">
          <div className="who"><strong>{profile.name}</strong>{ROLES[profile.role]?.label}</div>
          {extras}
        </div>
      </nav>

      <div className="main">
        <header className="topbar no-print">
          <div className="brand"><Logo /> <span className="only-wide">Hotzonex</span></div>
          <span className="spacer" />
          {view !== "team" && view !== "more" && (
            <LocationPicker profile={profile} value={loc} onChange={(v) => { setLoc(v); }} />
          )}
        </header>

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
              <div className="panel" style={{ display: "grid", gap: 4 }}>{extras}</div>
            </div>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {[...nav, ["more", "More", "more"]].map(([id, label, icon]) => (
          <button key={id} type="button" className="tab"
            aria-current={view === id || (id === "more" && view === "team") ? "page" : undefined}
            onClick={() => (id === "record" ? record(null) : go(id))}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
