// Génère les clés VAPID des notifications (à faire une seule fois).
// node scripts/vapid.mjs  -> copie VAPID_PUBLIC dans wrangler.toml / config.js, et VAPID_PRIVATE_JWK en secret :
//   npx wrangler secret put VAPID_PRIVATE_JWK
const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
console.log("VAPID_PUBLIC=" + Buffer.from(raw).toString("base64url"));
console.log("VAPID_PRIVATE_JWK=" + JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }));
