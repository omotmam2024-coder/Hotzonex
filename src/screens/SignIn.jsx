import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Banner, Field, Logo } from "../components/ui";

export default function SignIn({ notice }) {
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
      <div className="signin-card">
        <div className="brand"><Logo size={34} /> Hotzonex</div>
        <h1>Sign in</h1>
        <p>Record takings and see how each site is doing.</p>
        <Banner>{error || notice}</Banner>
        <form onSubmit={submit} className="fields" noValidate>
          <Field label="Email">
            {(id) => <input id={id} type="email" autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          <Field label="Password">
            {(id) => (
              <div className="pw">
                <input id={id} type={show ? "text" : "password"} autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-controls={id}>{show ? "Hide" : "Show"}</button>
              </div>
            )}
          </Field>
          <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="soft" style={{ marginTop: 20, fontSize: "var(--t-xs)" }}>
          Forgot your password? Ask the Hotzonex admin to set a new one.
        </p>
      </div>
    </main>
  );
}
