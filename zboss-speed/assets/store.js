// Accès aux inscriptions : Supabase (REST, sans dépendance) ou mode démo (localStorage).
(function () {
  const cfg = window.ZBOSS_CONFIG || {};
  const URL_ = (cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const KEY = cfg.SUPABASE_ANON_KEY || "";
  const demo = !(URL_ && KEY);
  const LS_ROWS = "zboss_demo_signups";
  const LS_SESSION = "zboss_session";
  const STATUSES = ["nouveau", "contacté", "invité", "actif", "refusé"];

  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ }
  }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
      });
  }

  async function api(path, { method = "GET", body, token, prefer } = {}) {
    const headers = { apikey: KEY, "Content-Type": "application/json" };
    // Clé publique dans « apikey » ; jeton utilisateur seulement une fois connecté
    if (token) headers.Authorization = "Bearer " + token;
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(URL_ + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.msg || data.error_description || data.error)) || res.statusText;
      const err = new Error(msg); err.status = res.status; err.code = data && data.code; throw err;
    }
    return data;
  }

  const Store = {
    demo,
    STATUSES,

    // Formulaire public : ajoute un inscrit
    async addSignup(s) {
      const row = {
        pseudo: s.pseudo.trim(),
        email: s.email.trim().toLowerCase(),
        country: s.country || null,
        platform: s.platform || null,
        newsletter: !!s.newsletter,
        source: s.source || "landing",
      };
      if (demo) {
        const rows = lsGet(LS_ROWS, []);
        if (rows.some(r => r.email === row.email)) { const e = new Error("duplicate"); e.code = "23505"; throw e; }
        rows.unshift({ id: uuid(), created_at: new Date().toISOString(), status: "nouveau", notes: "", ...row });
        lsSet(LS_ROWS, rows);
        return;
      }
      // return=minimal : le public peut insérer mais pas relire la table
      await api("/rest/v1/beta_signups", { method: "POST", body: row, prefer: "return=minimal" });
    },

    // --- CRM (administrateurs) ---
    session() { return demo ? { email: "demo@local", demo: true } : lsGet(LS_SESSION, null); },

    async signIn(email, password) {
      if (demo) return this.session();
      const data = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
      const s = { email: data.user && data.user.email, access_token: data.access_token,
        refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
      lsSet(LS_SESSION, s);
      return s;
    },

    async token() {
      let s = lsGet(LS_SESSION, null);
      if (!s) throw Object.assign(new Error("Non connecté"), { status: 401 });
      if (Date.now() > s.expires_at - 60000) {
        const data = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
        s = { ...s, access_token: data.access_token, refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
        lsSet(LS_SESSION, s);
      }
      return s.access_token;
    },

    signOut() { try { localStorage.removeItem(LS_SESSION); } catch (e) {} },

    async list() {
      if (demo) return lsGet(LS_ROWS, []);
      return api("/rest/v1/beta_signups?select=*&order=created_at.desc", { token: await this.token() });
    },

    async update(id, patch) {
      if (demo) {
        const rows = lsGet(LS_ROWS, []);
        const r = rows.find(x => x.id === id); if (r) Object.assign(r, patch);
        lsSet(LS_ROWS, rows); return;
      }
      await api("/rest/v1/beta_signups?id=eq." + encodeURIComponent(id),
        { method: "PATCH", body: patch, token: await this.token(), prefer: "return=minimal" });
    },

    async remove(id) {
      if (demo) { lsSet(LS_ROWS, lsGet(LS_ROWS, []).filter(x => x.id !== id)); return; }
      await api("/rest/v1/beta_signups?id=eq." + encodeURIComponent(id),
        { method: "DELETE", token: await this.token(), prefer: "return=minimal" });
    },
  };

  window.ZbossStore = Store;
})();
