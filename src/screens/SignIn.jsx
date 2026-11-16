import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Banner, Field, Icon } from "../components/ui";

export default function SignIn({ notice, theme, onToggleTheme }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (err) {
      setError(err.status === 400 || /invalid/i.test(err.message)
        ? "Email or password is wrong. Check both and try again."
        : "Can't reach the server. Check your internet connection and try again.");
    }
  }

  return (
    <main className="signin">
      <button type="button" className="icon-btn theme-float" onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
        <Icon name={theme === "dark" ? "moon" : "sun"} />
      </button>
      <div className="signin-card">
        <div className="signin-top">
          <span className="brand-mark"><Icon name="wifi" size={26} /></span>
          <div className="brand-name">HOTZONEX <span>WiFi</span></div>
          <div className="brand-sub">Automated business tracker</div>
        </div>
        <div className="panel">
          <h1>Sign in</h1>
          <p>Enter your email and password to open your dashboard.</p>
          <Banner>{error || notice}</Banner>
          <form onSubmit={submit} className="fields" noValidate>
            <Field label="Email">
              {(id) => <input id={id} type="email" autoComplete="email" inputMode="email" value={email}
                placeholder="you@hotzonex.com" onChange={(e) => setEmail(e.target.value)} autoFocus />}
            </Field>
            <Field label="Password">
              {(id) => (
                <div className="pw">
                  <input id={id} type={show ? "text" : "password"} autoComplete="current-password" value={password}
                    placeholder="Your password" onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-controls={id}>{show ? "Hide" : "Show"}</button>
                </div>
              )}
            </Field>
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 6, width: "100%" }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="soft" style={{ marginTop: 18, fontSize: 12, textAlign: "center", marginInline: "auto" }}>
          Forgot your password? Ask the Hotzonex admin to set a new one.
        </p>
      </div>
    </main>
  );
}

