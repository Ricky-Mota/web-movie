// Invitations automatiques au Tournoi Sponsor (championnat national).
//
// 1. Les joueurs RÉGULIERS du pays sont invités : au moins `invitation_jours_actifs` jours avec une course
//    valide sur les `invitation_periode_jours` derniers jours (réglable dans l'espace administrateur).
//    Invitation à la création du championnat, puis chaque heure pour les nouveaux réguliers,
//    tant que les qualifications ne sont pas finies.
// 2. Le joueur accepte ou refuse dans « Mon compte ». S'il accepte, il reçoit le programme :
//    jour et heure de début et de fin de chaque semaine, et le circuit.
// 3. La veille de chaque semaine (24 h avant), chaque joueur inscrit reçoit un rappel.
// Chaque message arrive dans le jeu (boîte « Mon compte »), en direct (Socket.IO) et par SMS.
import { requete } from '../db.js';
import { introuvable, conflit } from '../erreurs.js';
import { annoncerAuxJoueurs } from '../temps-reel.js';
import { fournisseurSms } from '../sms/index.js';

const FUSEAU = 'Africa/Kinshasa';
const jourHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
/** « lundi 23 novembre à 00h00 » (heure de Kinshasa). */
export function dateKin(d) {
  return jourHeure.format(new Date(d)).replace(/ (\d\d):(\d\d)$/, ' à $1h$2').replace(/ à à /, ' à ');
}
// Une semaine finit le lundi suivant à 00h00 : on l'annonce comme « dimanche … à 23h59 ».
const finKin = (fin) => dateKin(new Date(new Date(fin).getTime() - 60 * 1000));
// « Rond-point Victoire (web) » : la mention technique ne sert à rien au joueur.
const nomCircuit = (nom) => String(nom).replace(/ \(web\)$/, '');
const nomSemaine = (n) => (n === 1 ? 'Qualifications' : `Journée ${n - 1}`);

async function reglages() {
  const { rows: [p] } = await requete('SELECT invitation_jours_actifs, invitation_periode_jours, invitations_sms FROM parametres');
  return p;
}

/** Joueurs réguliers d'un pays, non bloqués. */
export async function joueursReguliers(paysCode, { jours, periode }) {
  const { rows } = await requete(
    `SELECT j.id, j.pseudo, j.telephone FROM joueurs j
      WHERE j.pays_code = $1 AND NOT j.bloque
        AND (SELECT count(DISTINCT (c.cree_le AT TIME ZONE '${FUSEAU}')::date) FROM courses c
              WHERE c.joueur_id = j.id AND c.valide AND c.cree_le > now() - make_interval(days => $3)) >= $2
      ORDER BY j.pseudo`, [paysCode, jours, periode]);
  return rows;
}

/** Message dans le jeu + en direct + SMS (le SMS est facultatif et n'empêche jamais le reste). */
export async function notifier(joueur, { type, titre, texte, sms, donnees = null }, { avecSms = true } = {}) {
  const { rows: [n] } = await requete(
    'INSERT INTO notifications (joueur_id, type, titre, texte, donnees) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [joueur.id, type, titre, texte, donnees]);
  annoncerAuxJoueurs([joueur.id], 'notification', { id: n.id, type, titre, texte, donnees });
  if (avecSms && sms && joueur.telephone) {
    try { await fournisseurSms().envoyer(joueur.telephone, sms.slice(0, 300)); } catch (e) { console.error('SMS notification :', e.message); }
  }
  return n;
}

async function championnatAvecSemaines(championnatId) {
  const { rows: [c] } = await requete('SELECT * FROM championnats WHERE id = $1', [championnatId]);
  if (!c) throw introuvable('Championnat introuvable.');
  const { rows: semaines } = await requete(
    `SELECT s.numero, s.debut, s.fin, s.cloturee_le, ci.code AS circuit, ci.nom AS circuit_nom
       FROM championnat_semaines s JOIN circuits ci ON ci.id = s.circuit_id
      WHERE s.championnat_id = $1 ORDER BY s.numero`, [championnatId]);
  return { ...c, semaines };
}

/** Le programme complet, en clair (jours et heures de Kinshasa). */
export function programme(champ) {
  return champ.semaines.map((s) => ({
    numero: s.numero, nom: nomSemaine(s.numero), circuit: s.circuit, circuit_nom: nomCircuit(s.circuit_nom),
    debut: s.debut, fin: s.fin, debut_texte: dateKin(s.debut), fin_texte: finKin(s.fin),
  }));
}

/** Invite les joueurs réguliers pas encore invités. Renvoie le nombre de nouvelles invitations. */
export async function inviterReguliers(championnatId) {
  const champ = await championnatAvecSemaines(championnatId);
  const qualifs = champ.semaines[0];
  if (champ.statut !== 'active' || !qualifs || new Date(qualifs.fin) <= new Date()) return 0;
  const r = await reglages();
  const reguliers = await joueursReguliers(champ.pays_code, { jours: r.invitation_jours_actifs, periode: r.invitation_periode_jours });
  let nouvelles = 0;
  for (const j of reguliers) {
    const { rows: [inv] } = await requete(
      `INSERT INTO invitations_tournoi (championnat_id, joueur_id) VALUES ($1, $2)
       ON CONFLICT (championnat_id, joueur_id) DO NOTHING RETURNING id`, [champ.id, j.id]);
    if (!inv) continue;
    nouvelles += 1;
    const quand = `Qualifications du ${dateKin(qualifs.debut)} au ${finKin(qualifs.fin)} (heure de Kinshasa)`;
    await notifier(j, {
      type: 'invitation',
      titre: `Invitation : ${champ.nom}`,
      texte: `Vous faites partie des joueurs réguliers : vous êtes invité au Tournoi Sponsor « ${champ.nom} » (sponsor ${champ.sponsor}). ${quand}. Acceptez l'invitation dans « Mon compte » pour recevoir le programme et les rappels.`,
      sms: `G-Challenge : vous etes invite au ${champ.nom} (sponsor ${champ.sponsor}). Qualifications des le ${dateKin(qualifs.debut)}. Acceptez dans Mon compte.`,
      donnees: { invitation_id: inv.id, championnat_id: champ.id },
    }, { avecSms: r.invitations_sms });
  }
  return nouvelles;
}

/** Les invitations d'un joueur (les plus récentes d'abord), avec le programme. */
export async function mesInvitations(joueurId) {
  const { rows } = await requete(
    `SELECT i.*, c.nom, c.sponsor, c.pays_code, c.statut AS statut_championnat
       FROM invitations_tournoi i JOIN championnats c ON c.id = i.championnat_id
      WHERE i.joueur_id = $1 ORDER BY i.envoyee_le DESC LIMIT 20`, [joueurId]);
  const res = [];
  for (const i of rows) {
    const champ = await championnatAvecSemaines(i.championnat_id);
    res.push({ id: i.id, championnat_id: i.championnat_id, nom: i.nom, sponsor: i.sponsor, pays: i.pays_code,
      statut: i.statut, envoyee_le: i.envoyee_le, repondue_le: i.repondue_le, programme: programme(champ) });
  }
  return res;
}

/** Le joueur accepte ou refuse. S'il accepte : confirmation avec le jour et l'heure de chaque épreuve. */
export async function repondreInvitation(joueurId, invitationId, accepter) {
  const { rows: [i] } = await requete(
    'SELECT * FROM invitations_tournoi WHERE id = $1 AND joueur_id = $2', [invitationId, joueurId]);
  if (!i) throw introuvable('Invitation introuvable.');
  const champ = await championnatAvecSemaines(i.championnat_id);
  const derniere = champ.semaines[champ.semaines.length - 1];
  if (champ.statut !== 'active' || (derniere && new Date(derniere.fin) <= new Date())) {
    throw conflit('championnat_termine', 'Ce championnat est terminé.');
  }
  const statut = accepter ? 'acceptee' : 'refusee';
  if (i.statut === statut) return { statut };
  await requete('UPDATE invitations_tournoi SET statut = $2, repondue_le = now() WHERE id = $1', [i.id, statut]);
  if (accepter) {
    const { rows: [j] } = await requete('SELECT id, pseudo, telephone FROM joueurs WHERE id = $1', [joueurId]);
    const { rows: [eq] } = await requete(
      `SELECT count(*)::int AS n FROM equipe_membres m JOIN equipes e ON e.id = m.equipe_id
        WHERE m.joueur_id = $1 AND e.taille_max > 1`, [joueurId]);
    const prog = programme(champ).filter((s) => new Date(s.fin) > new Date());
    const lignes = prog.map((s) => `${s.nom} : du ${s.debut_texte} au ${s.fin_texte}, circuit ${s.circuit_nom}`);
    const r = await reglages();
    await notifier(j, {
      type: 'confirmation',
      titre: `Inscription confirmée : ${champ.nom}`,
      texte: `Vous êtes inscrit. Programme (heure de Kinshasa) : ${lignes.join(' ; ')}. Vous recevrez un rappel la veille de chaque épreuve.` +
        (eq.n ? '' : ' Pensez à créer ou rejoindre une équipe de 4 pilotes dans « Mon compte » : le temps de l\'équipe compte pour le classement.'),
      sms: prog[0] ? `G-Challenge : inscription confirmee au ${champ.nom}. ${prog[0].nom} du ${prog[0].debut_texte} au ${prog[0].fin_texte}. Rappel la veille.` : null,
      donnees: { invitation_id: i.id, championnat_id: champ.id },
    }, { avecSms: r.invitations_sms });
  }
  return { statut };
}

/**
 * Rappel aux joueurs inscrits, la veille de chaque semaine (dans les 24 h avant son début).
 * `maintenant` sert aux tests. Renvoie le nombre de rappels envoyés.
 */
export async function envoyerRappels({ maintenant = new Date(), horizonHeures = 24 } = {}) {
  const { rows } = await requete(
    `SELECT s.championnat_id, s.numero, s.debut, s.fin, ci.nom AS circuit_nom, c.nom, j.id AS joueur_id, j.telephone
       FROM championnat_semaines s
       JOIN championnats c ON c.id = s.championnat_id AND c.statut = 'active'
       JOIN circuits ci ON ci.id = s.circuit_id
       JOIN invitations_tournoi i ON i.championnat_id = s.championnat_id AND i.statut = 'acceptee'
       JOIN joueurs j ON j.id = i.joueur_id AND NOT j.bloque
      WHERE s.cloturee_le IS NULL AND s.debut > $1 AND s.debut <= $1::timestamptz + make_interval(hours => $2)
        AND NOT EXISTS (SELECT 1 FROM rappels_semaine r WHERE r.championnat_id = s.championnat_id AND r.numero = s.numero AND r.joueur_id = j.id)`,
    [maintenant, horizonHeures]);
  const r = await reglages();
  let n = 0;
  for (const x of rows) {
    const { rowCount } = await requete(
      'INSERT INTO rappels_semaine (championnat_id, numero, joueur_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [x.championnat_id, x.numero, x.joueur_id]);
    if (!rowCount) continue;
    n += 1;
    const quoi = nomSemaine(x.numero);
    await notifier({ id: x.joueur_id, telephone: x.telephone }, {
      type: 'rappel',
      titre: `Rappel : ${quoi} du ${x.nom}`,
      texte: `${quoi} commence le ${dateKin(x.debut)} et se termine le ${finKin(x.fin)} (heure de Kinshasa). Circuit : ${nomCircuit(x.circuit_nom)}. Votre meilleur temps de la semaine compte pour votre équipe.`,
      sms: `G-Challenge : ${quoi} du ${x.nom} commence le ${dateKin(x.debut)}. Circuit ${nomCircuit(x.circuit_nom)}. Fin le ${finKin(x.fin)}.`,
      donnees: { championnat_id: x.championnat_id, numero: x.numero },
    }, { avecSms: r.invitations_sms });
  }
  return n;
}

let derniereInvitation = 0;
/** Appelé chaque minute par le planificateur : rappels à chaque fois, invitations au plus une fois par heure. */
export async function traiterInvitations({ forcer = false } = {}) {
  if (forcer || Date.now() - derniereInvitation > 60 * 60 * 1000) {
    derniereInvitation = Date.now();
    const { rows } = await requete(
      `SELECT c.id FROM championnats c JOIN championnat_semaines s ON s.championnat_id = c.id AND s.numero = 1
        WHERE c.statut = 'active' AND s.fin > now()`);
    for (const c of rows) {
      try { await inviterReguliers(c.id); } catch (e) { console.error('Invitations :', e.message); }
    }
  }
  return envoyerRappels();
}

/** Pour l'espace administrateur : nombre d'invitations par statut. */
export async function statsInvitations(championnatId) {
  const { rows } = await requete(
    'SELECT statut, count(*)::int AS n FROM invitations_tournoi WHERE championnat_id = $1 GROUP BY statut', [championnatId]);
  const s = { envoyee: 0, acceptee: 0, refusee: 0 };
  for (const r of rows) s[r.statut] = r.n;
  return s;
}

/** Boîte de réception. */
export async function mesNotifications(joueurId) {
  const { rows } = await requete(
    'SELECT id, type, titre, texte, donnees, lue_le, cree_le FROM notifications WHERE joueur_id = $1 ORDER BY cree_le DESC, id DESC LIMIT 30', [joueurId]);
  return { non_lues: rows.filter((n) => !n.lue_le).length, notifications: rows };
}
export async function marquerLues(joueurId) {
  await requete('UPDATE notifications SET lue_le = now() WHERE joueur_id = $1 AND lue_le IS NULL', [joueurId]);
}
