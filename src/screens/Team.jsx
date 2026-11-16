import { useEffect, useState } from "react";
import { fetchProfiles, teamAction } from "../lib/api";
import { LOCATIONS, LOC, ROLES } from "../lib/locations";
import { Banner, DeleteButton, Field, Loading } from "../components/ui";

const ROLE_HELP = {
  admin: "Everything, including deleting records and managing the team.",
  manager: "Records and reports for every site. Can't delete.",
  staff: "Records and sees only their own site.",
  viewer: "Sees reports for every site. Can't record.",
};

export default function Team({ profile, notify }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null, "new", or a profile

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    fetchProfiles()
      .then((p) => { if (live) { setPeople(p); setError(""); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [version]);

  return (
    <div>
      <div className="page-head">
        <div><h1>Team</h1><p>Who can sign in, and what they can do.</p></div>
        {editing === null && <button type="button" className="btn" onClick={() => setEditing("new")}>Add a person</button>}
      </div>
      <Banner>{error}</Banner>
      {editing !== null && (
        <PersonForm key={editing === "new" ? "new" : editing.id} person={editing === "new" ? null : editing} isSelf={editing?.id === profile.id}
          onDone={(msg) => { setEditing(null); if (msg) { notify(msg); setVersion((v) => v + 1); } }} />
      )}
      <section className="panel" style={{ marginTop: editing !== null ? 16 : 0 }}>
        {!people ? <Loading label="Loading the team…" /> : (
          <ul className="sites">
            {people.map((p) => (
              <li key={p.id}>
                <span className="dot" style={{ background: p.active ? LOC[p.location]?.hue : "var(--rule-strong)" }} />
                <span className="grow">
                  <strong>{p.name}</strong>{p.id === profile.id && <span className="soft"> (you)</span>}
                  <span className="meta">{ROLES[p.role]?.label} at {p.role === "staff" ? LOC[p.location]?.label : "all sites"}{p.email ? `, ${p.email}` : ""}{p.active ? "" : ". Can't sign in."}</span>
                </span>
                <button type="button" className="btn quiet small" onClick={() => setEditing(p)}>Change</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonForm({ person, isSelf, onDone }) {
  const [form, setForm] = useState({
    name: person?.name ?? "", email: person?.email ?? "", password: "",
    role: person?.role ?? "staff", location: person?.location ?? "HQ", active: person?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Enter the person's name.");
    if (!person && !form.email.trim()) return setError("Enter the email they'll sign in with.");
    if ((!person || form.password) && form.password.length < 8) return setError("Passwords need at least 8 characters.");
    setBusy(true); setError("");
    try {
      if (person) await teamAction("update", { id: person.id, ...form });
      else await teamAction("create", form);
      onDone(person ? `${form.name.trim()} updated` : `${form.name.trim()} can now sign in`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2 style={{ marginBottom: 14 }}>{person ? `Change ${person.name}` : "Add a person"}</h2>
      <div className="fields two">
        <Field label="Name">{(id) => <input id={id} value={form.name} onChange={set("name")} />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" value={form.email} onChange={set("email")} disabled={Boolean(person)} />}</Field>
        <Field label={person ? "New password (leave empty to keep)" : "Password"} hint="At least 8 characters. Share it with them in person.">
          {(id) => <input id={id} type="text" autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          {(id) => <select id={id} value={form.role} onChange={set("role")} disabled={isSelf}>
            {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>}
        </Field>
        <Field label="Site" hint="Staff can only see and record for this site.">
          {(id) => <select id={id} value={form.location} onChange={set("location")}>
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>}
        </Field>
      </div>
      {!isSelf && (
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, minHeight: 44 }}>
          <input type="checkbox" checked={form.active} onChange={set("active")} style={{ width: 20, height: 20 }} />
          Allowed to sign in
        </label>
      )}
      <Banner>{error}</Banner>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : person ? "Save changes" : "Add person"}</button>
        <button className="btn quiet" type="button" onClick={() => onDone(null)}>Cancel</button>
        {person && !isSelf && (
          <span style={{ marginLeft: "auto" }}>
            <DeleteButton label="Remove from team" onDelete={async () => {
              try { await teamAction("delete", { id: person.id }); onDone(`${person.name} removed`); } catch (err) { setError(err.message); }
            }} />
          </span>
        )}
      </div>
    </form>
  );
}
