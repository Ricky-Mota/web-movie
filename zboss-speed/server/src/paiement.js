// 2 Life : passerelle de paiement (dépôts et retraits en argent réel).
//
// Tant que REAL_MONEY est faux (life.js), le guichet reste en simulation et ce fichier n'est pas appelé.
// Le jour où les autorisations sont obtenues :
//   1. signer avec un agrégateur agréé en RDC (mobile money M-Pesa, Orange Money, Airtel Money + cartes) ;
//   2. renseigner dans Cloudflare : PAY_PROVIDER = "agregateur", PAY_API_URL (variable),
//      PAY_API_KEY et PAY_WEBHOOK_SECRET (secrets) ;
//   3. adapter, si besoin, les deux fonctions toProvider* / fromProvider* ci-dessous aux noms de champs de l'agrégateur ;
//   4. donner à l'agrégateur l'adresse de notification : https://<site>/api/paiement/notification ;
//   5. passer REAL_MONEY à true.
// Le reste du jeu (crédit des e-makuta, remboursement si un retrait échoue, historique) est déjà branché.

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

// ---- correspondance avec l'API de l'agrégateur (seul endroit à adapter)
function toProviderCollect(o) {
  return { reference: o.ref, amount: o.usd, currency: "USD", channel: o.moyen, phone: o.telephone || undefined,
    description: "Dépôt 2 Life", callback_url: o.notifyUrl, return_url: o.returnUrl };
}
function toProviderPayout(o) {
  return { reference: o.ref, amount: o.usd, currency: "USD", channel: o.moyen, phone: o.telephone || undefined,
    description: "Retrait 2 Life", callback_url: o.notifyUrl };
}
// notification reçue : { reference, status: "success" | "failed" | "pending", amount }
function fromProviderNotice(b) {
  const st = String(b.status || b.statut || "").toLowerCase();
  return { ref: String(b.reference || b.ref || ""), amount: Number(b.amount ?? b.montant), status: ["success", "successful", "paid", "completed", "ok"].includes(st) ? "paye" : ["failed", "failure", "cancelled", "canceled", "rejected", "expired"].includes(st) ? "echoue" : "en_attente" };
}

export function payConfigured(env) {
  return env.PAY_PROVIDER === "agregateur" && !!env.PAY_API_URL && !!env.PAY_API_KEY && !!env.PAY_WEBHOOK_SECRET;
}

async function post(env, path, body) {
  const r = await fetch(env.PAY_API_URL.replace(/\/$/, "") + path, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.PAY_API_KEY}` }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Passerelle de paiement indisponible (${r.status}).`);
  return data;
}

// dépôt : la passerelle renvoie soit une page de paiement (carte), soit une demande de validation sur le téléphone (mobile money)
export async function startDeposit(env, o) {
  const d = await post(env, "/collect", toProviderCollect(o));
  return { redirect: d.redirect_url || d.payment_url || null, providerRef: d.transaction_id || d.id || null,
    message: d.redirect_url || d.payment_url ? "Termine le paiement sur la page sécurisée." : "Valide le paiement sur ton téléphone (code secret mobile money)." };
}
export async function startPayout(env, o) {
  const d = await post(env, "/payout", toProviderPayout(o));
  return { providerRef: d.transaction_id || d.id || null };
}

// la notification doit être signée : en-tête X-Signature = HMAC-SHA256 du corps brut avec PAY_WEBHOOK_SECRET (hexadécimal)
export async function readNotice(env, req) {
  const raw = await req.text(), sig = (req.headers.get("x-signature") || "").toLowerCase().replace(/^sha256=/, "");
  const key = await crypto.subtle.importKey("raw", enc.encode(env.PAY_WEBHOOK_SECRET || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const good = hex(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  if (!sig || sig.length !== good.length) return null;
  let diff = 0; for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  try { return fromProviderNotice(JSON.parse(raw)); } catch { return null; }
}
