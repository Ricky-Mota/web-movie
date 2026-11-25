// 2 Life : la ville en direct. Un « Durable Object » par ville garde la position des vrais joueurs
// connectés à la ville 3D et la renvoie aux autres. Rien n'est écrit dans la base : tout reste en mémoire
// (WebSocket « hibernable » : l'objet dort quand personne ne parle, et ne coûte rien).

export const LIVE_SEND_MS = 2000;      // un joueur envoie sa position toutes les 2 s
const MIN_GAP_MS = 700;                // au-delà, les messages trop rapprochés sont ignorés
const STALE_MS = 30000;                // un joueur muet depuis 30 s disparaît de la ville
const RANGE = 3000;                    // on ne voit que les joueurs à moins de 3 000 unités (≈ 2 km)
const MAX_SEEN = 40;
const MODES = ["pied", "auto", "bus"];

const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

// nettoie une position envoyée par le navigateur ; null si elle est invalide
export function cleanPosition(d) {
  if (!d || typeof d !== "object") return null;
  const x = num(d.x, -1e6, 1e6), y = num(d.y, -1e6, 1e6), a = num(d.a, -1e3, 1e3);
  if (x === null || y === null) return null;
  return { x: Math.round(x), y: Math.round(y), a: a === null ? 0 : Math.round(a * 100) / 100, m: MODES.includes(d.m) ? d.m : "pied" };
}

// ce qu'un joueur voit : les autres joueurs récents et proches, les plus proches d'abord
export function visibleFrom(me, all, now) {
  return all.filter(o => o && o.id !== me.id && o.x !== null && now - o.t < STALE_MS && Math.abs(o.x - me.x) < RANGE && Math.abs(o.y - me.y) < RANGE)
    .sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
    .slice(0, MAX_SEEN).map(o => ({ id: o.id, nom: o.nom, fem: o.fem, x: o.x, y: o.y, a: o.a, m: o.m }));
}

export class CityRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("WebSocket attendu.", { status: 426 });
    const id = req.headers.get("X-Joueur") || "";
    let nom = "Habitant"; try { nom = decodeURIComponent(req.headers.get("X-Nom") || "") || nom; } catch (e) { }
    // un seul onglet par joueur : l'ancienne connexion est fermée
    for (const old of this.ctx.getWebSockets(id)) { try { old.close(4000, "Ouvert dans un autre onglet."); } catch (e) { } }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, nom: nom.slice(0, 30), fem: req.headers.get("X-Fem") === "1", x: null, y: null, a: 0, m: "pied", t: 0 });
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "twolife" } });
  }

  async webSocketMessage(ws, msg) {
    const now = Date.now(), me = ws.deserializeAttachment();
    if (!me || typeof msg !== "string" || msg.length > 300) return;
    if (now - me.t < MIN_GAP_MS) return;
    let d; try { d = JSON.parse(msg); } catch (e) { return; }
    const pos = cleanPosition(d); if (!pos) return;
    Object.assign(me, pos, { t: now }); ws.serializeAttachment(me);
    const all = this.ctx.getWebSockets().map(s => { try { return s.deserializeAttachment(); } catch (e) { return null; } });
    try { ws.send(JSON.stringify({ moi: me.id, joueurs: visibleFrom(me, all, now), en_ligne: all.filter(o => o && now - o.t < STALE_MS).length })); } catch (e) { }
  }

  async webSocketClose(ws, code) { try { ws.close(code === 1000 || code >= 3000 ? code : 1000, "Au revoir"); } catch (e) { } }
  async webSocketError(ws) { try { ws.close(1011, "Erreur"); } catch (e) { } }
}
