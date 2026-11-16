// Team management for admins. Runs on Vercel, where the Supabase service-role
// key is kept as the SUPABASE_SERVICE_ROLE_KEY environment variable. The key
// never reaches the browser.
const SUPABASE_URL = "https://prxumouufckubwioywuz.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeHVtb3V1ZmNrdWJ3aW95d3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDc2NTIsImV4cCI6MjA5NTgyMzY1Mn0.RpK8UmfzQhXVVuuVhsj5QH3HDhwT6RAm0ID0o_MqR7U";
const ROLES = ["admin", "manager", "staff", "viewer"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function call(path, { key, token, method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status >= 500 ? 502 : 400, data?.msg || data?.message || data?.error_description || "Supabase refused the request.");
  return data;
}

function cleanProfile(body, siteIds) {
  const out = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) throw new HttpError(400, "Enter the person's name.");
    out.name = String(body.name).trim().slice(0, 80);
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, "Choose a role from the list.");
    out.role = body.role;
  }
  if (body.location !== undefined) {
    if (!siteIds.includes(body.location)) throw new HttpError(400, "Choose a site from the list.");
    out.location = body.location;
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) throw new HttpError(500, "Team management isn't switched on yet: the server is missing its Supabase key.");

    // 1. Who is asking? Their sign-in token must be valid…
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Sign in again, then retry.");
    const caller = await call("/auth/v1/user", { key: ANON_KEY, token }).catch(() => { throw new HttpError(401, "Sign in again, then retry."); });

    // 2. …and belong to an active admin.
    const [me] = await call(`/rest/v1/profiles?id=eq.${caller.id}&select=role,active`, { key: service });
    if (!me || me.role !== "admin" || !me.active) throw new HttpError(403, "Only an admin can change the team.");

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { action } = body;
    // Sites come from Hotzonex Cloud (mirrored in the tracker's sites table).
    const siteIds = (await call("/rest/v1/sites?select=id", { key: service })).map((s) => s.id);

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
      if (String(body.password || "").length < 8) throw new HttpError(400, "Passwords need at least 8 characters.");
      const profile = cleanProfile({ role: "staff", location: siteIds[0], active: true, ...body }, siteIds);
      if (!profile.name) throw new HttpError(400, "Enter the person's name.");
      const user = await call("/auth/v1/admin/users", { key: service, method: "POST", body: { email, password: body.password, email_confirm: true } });
      await call("/rest/v1/profiles", { key: service, method: "POST", prefer: "return=minimal", body: { id: user.id, email, ...profile } });
      return res.status(200).json({ ok: true, id: user.id });
    }

    if (action === "update") {
      if (!UUID.test(String(body.id || ""))) throw new HttpError(400, "Which person?");
      const profile = cleanProfile(body, siteIds);
      if (body.id === caller.id) { delete profile.role; delete profile.active; } // can't lock yourself out
      if (body.password) {
        if (String(body.password).length < 8) throw new HttpError(400, "Passwords need at least 8 characters.");
        await call(`/auth/v1/admin/users/${body.id}`, { key: service, method: "PUT", body: { password: body.password } });
      }
      if (profile.active !== undefined) {
        await call(`/auth/v1/admin/users/${body.id}`, { key: service, method: "PUT", body: { ban_duration: profile.active ? "none" : "876000h" } });
      }
      if (Object.keys(profile).length) {
        await call(`/rest/v1/profiles?id=eq.${body.id}`, { key: service, method: "PATCH", prefer: "return=minimal", body: profile });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "delete") {
      if (!UUID.test(String(body.id || ""))) throw new HttpError(400, "Which person?");
      if (body.id === caller.id) throw new HttpError(400, "You can't remove yourself.");
      await call(`/auth/v1/admin/users/${body.id}`, { key: service, method: "DELETE" }); // profile row goes with it (on delete cascade)
      return res.status(200).json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong on the server. Try again." });
  }
}
