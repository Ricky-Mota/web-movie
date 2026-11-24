// 2 Life : notifications sur le téléphone (Web Push standard, gratuit, sans service tiers payant).
// Chiffrement RFC 8291 (aes128gcm) et signature VAPID RFC 8292, avec WebCrypto uniquement (aucune dépendance).
const te = new TextEncoder();
export const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), c => c.charCodeAt(0)),
};
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// chiffre le message pour un abonnement (clés p256dh et auth du navigateur)
export async function encryptPayload(text, p256dh, auth, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys = null) {
  const ua = b64u.dec(p256dh), secret = b64u.dec(auth);
  const as = asKeys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(secret, ecdh);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), ua, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return cat(head, asPub, ct);
}

// en-tête Authorization VAPID (JWT ES256) pour le service de notification du navigateur
export async function vapidHeader(endpoint, publicKey, privateJwk, subject) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const part = o => b64u.enc(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud, exp: now + 12 * 3600, sub: subject })}`;
  const key = await crypto.subtle.importKey("jwk", typeof privateJwk === "string" ? JSON.parse(privateJwk) : privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.enc(sig)}, k=${publicKey}`;
}

// envoie une notification ; renvoie "ok", "expire" (abonnement à supprimer) ou "erreur"
// keys = { publique, privee (JWK), sujet }
export async function sendPush(keys, sub, message) {
  if (!keys || !keys.publique || !keys.privee) return "erreur";
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: "POST", body,
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal",
      Authorization: await vapidHeader(sub.endpoint, keys.publique, keys.privee, keys.sujet || "https://2life.example") },
  });
  return r.ok ? "ok" : r.status === 404 || r.status === 410 ? "expire" : "erreur";
}

// crée une paire de clés VAPID (publique en base64url, privée en JWK)
export async function newVapidKeys() {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
  return { publique: b64u.enc(await crypto.subtle.exportKey("raw", k.publicKey)), privee: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
}
