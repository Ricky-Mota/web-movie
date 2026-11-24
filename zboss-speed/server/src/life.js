// 2 Life : règles de vie partagées par le serveur (Cloudflare Worker) et l'écran du joueur.
// Aucune dépendance, aucun accès réseau : uniquement des calculs.

// ---------------------------------------------------------------- le temps
// Enfance (0 à 18 ans) en environ 6 mois réels, puis vie adulte lente :
// on devient vieux (65 ans) après environ 10 ans de jeu réel.
export const DAY = 864e5;
export const CHILD_YEARS = 18;
export const CHILD_REAL_DAYS = 182;
export const ADULT_YEARS_PER_REAL_DAY = 4.7 / 365; // 18 -> 65 ans en environ 10 ans réels

export function ageYears(bornAt, now = Date.now()) {
  const days = Math.max(0, (now - bornAt) / DAY);
  if (days <= CHILD_REAL_DAYS) return days / CHILD_REAL_DAYS * CHILD_YEARS;
  return CHILD_YEARS + (days - CHILD_REAL_DAYS) * ADULT_YEARS_PER_REAL_DAY;
}

// durée réelle (ms) avant d'atteindre un âge donné
export function realMsUntil(bornAt, years, now = Date.now()) {
  const d = years <= CHILD_YEARS ? years / CHILD_YEARS * CHILD_REAL_DAYS : CHILD_REAL_DAYS + (years - CHILD_YEARS) / ADULT_YEARS_PER_REAL_DAY;
  return Math.max(0, bornAt + d * DAY - now);
}

export const STAGES = [
  { id: "bebe", label: "Bébé", from: 0 },
  { id: "enfant", label: "Enfant", from: 3 },
  { id: "ado", label: "Adolescent", from: 12 },
  { id: "adulte", label: "Adulte", from: 18 },
  { id: "senior", label: "Senior", from: 65 },
];
export function stageOf(age) {
  let s = STAGES[0];
  for (const x of STAGES) if (age >= x.from) s = x;
  return s;
}

// ---------------------------------------------------------------- talents cachés
export const TALENTS = [
  { id: "soin", label: "Soin", hint: "a des gestes doux et précis" },
  { id: "commerce", label: "Commerce", hint: "sait déjà négocier" },
  { id: "sport", label: "Sport", hint: "court plus vite que les autres" },
  { id: "art", label: "Art", hint: "invente des chansons et des dessins" },
  { id: "technique", label: "Technique", hint: "démonte et répare les objets" },
  { id: "etudes", label: "Études", hint: "apprend à lire très vite" },
  { id: "parole", label: "Parole", hint: "convainc tout le monde autour de lui" },
  { id: "cuisine", label: "Cuisine", hint: "goûte et mélange les saveurs" },
];
export const TALENT_BONUS = 0.3; // +30 % dans le domaine une fois découvert

// activités que les parents proposent ; chacune révèle un talent
export const ACTIVITIES = [
  // bébé (dès la naissance)
  { id: "cubes", label: "Empiler des cubes", talent: "technique", minAge: 0, energy: 10 },
  { id: "comptines", label: "Chanter des comptines", talent: "art", minAge: 0, energy: 8 },
  { id: "histoires", label: "Écouter des histoires", talent: "etudes", minAge: 0, energy: 6 },
  { id: "ramper", label: "Ramper et attraper la balle", talent: "sport", minAge: 0, energy: 12 },
  // enfant
  { id: "ballon", label: "Jouer au ballon", talent: "sport", minAge: 3, energy: 18 },
  { id: "dessin", label: "Dessiner et chanter", talent: "art", minAge: 2, energy: 8 },
  { id: "lecture", label: "Lire des histoires", talent: "etudes", minAge: 3, energy: 6 },
  { id: "marche", label: "Aider au marché", talent: "commerce", minAge: 6, energy: 12 },
  { id: "bricolage", label: "Bricoler avec un oncle", talent: "technique", minAge: 6, energy: 12 },
  { id: "infirmerie", label: "Soigner une poupée, aider grand-mère", talent: "soin", minAge: 3, energy: 6 },
  { id: "debat", label: "Raconter devant la famille", talent: "parole", minAge: 5, energy: 8 },
  { id: "cuisine", label: "Aider à la cuisine", talent: "cuisine", minAge: 5, energy: 8 },
];

// générateur pseudo-aléatoire reproductible (graine numérique)
export function rng(seed) {
  let h = seed >>> 0 || 1;
  return () => ((h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
}

export function drawTalents(r) {
  const pool = TALENTS.slice();
  const n = r() < 0.35 ? 2 : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * pool.length);
    out.push({ talent: pool.splice(k, 1)[0].id, level: 1 + Math.floor(r() * 3) });
  }
  return out;
}

// Une activité : renvoie l'effet et, parfois, la découverte d'un talent.
// talents = [{talent, level, discovered}]
export function doActivity(act, talents, age, r) {
  if (age < act.minAge) return { ok: false, message: "Trop petit pour cette activité." };
  const t = talents.find(x => x.talent === act.talent);
  if (!t) return { ok: true, score: 40 + Math.floor(r() * 25), message: "Une activité sympathique, sans plus." };
  const score = 70 + t.level * 8 + Math.floor(r() * 10);
  if (t.discovered) return { ok: true, score: Math.min(100, Math.round(score * (1 + TALENT_BONUS))), message: "Son talent fait la différence." };
  const chance = 0.25 + t.level * 0.1;
  if (r() < chance) return { ok: true, score, discovered: t.talent, message: "Talent découvert !" };
  const info = TALENTS.find(x => x.id === t.talent);
  return { ok: true, score, hint: t.talent, message: "Indice : l'enfant " + info.hint + "." };
}

// ---------------------------------------------------------------- besoins
// valeurs 0..100, recalculées à la demande depuis la dernière mise à jour
export function needsAt(c, now = Date.now()) {
  const h = Math.max(0, (now - c.updatedAt) / 36e5);
  const hunger = Math.max(0, c.hunger - h * 4);          // la faim baisse de 4 points par heure réelle
  const energy = Math.min(100, c.energy + h * 12);       // l'énergie remonte au repos
  const happy = Math.max(0, Math.min(100, c.happiness - h * 1.5 + (hunger > 50 ? 0 : -h * 2)));
  const health = Math.max(0, Math.min(100, c.health - (hunger < 15 ? h * 3 : 0)));
  return { hunger, energy, happiness: happy, health };
}

// ---------------------------------------------------------------- identité
export const FIRST_NAMES = {};
const FIRST_M = ["Junior", "Patient", "Glody", "Merveil", "Exaucé", "Christian", "Dieumerci", "Bienvenu", "Héritier", "Josué", "Fiston", "Trésor"];
const FIRST_F = ["Grâce", "Merveille", "Divine", "Plamedie", "Exaucée", "Gloria", "Ornella", "Bénédicte", "Naomie", "Rachel", "Dorcas", "Prisca"];
const LAST = ["Mbuyi", "Kabeya", "Ilunga", "Lukusa", "Mukendi", "Tshibangu", "Kasongo", "Nzuzi", "Makiese", "Lutumba", "Mbala", "Kalala", "Mputu", "Kanku"];
FIRST_NAMES.M = FIRST_M; FIRST_NAMES.F = FIRST_F;
const QUARTIERS = ["Gombe", "Lingwala", "Kinshasa", "Barumbu", "Kalamu", "Limete", "Kasa-Vubu", "Bandalungwa"];

export function newIdentity(r, sex) {
  const s = sex || (r() < 0.5 ? "F" : "M");
  const pick = a => a[Math.floor(r() * a.length)];
  const last = pick(LAST);
  return {
    sex: s,
    firstName: pick(s === "F" ? FIRST_F : FIRST_M),
    lastName: last,
    quartier: pick(QUARTIERS),
    mother: pick(FIRST_F) + " " + last,
    father: pick(FIRST_M) + " " + last,
    look: Math.floor(r() * 1e6),
  };
}

export const BIRTH_GIFT = 500; // makuta (25 e-makuta) offerts à la naissance (épargne des parents)

// ---------------------------------------------------------------- magasin
// prix en e-makuta ; les vêtements se portent et changent l'apparence 3D, la nourriture se mange tout de suite
export const SHOP = [
  // nourriture
  { id: "beignets", nom: "Beignets et thé", type: "nourriture", prix: 10, effet: { faim: 20, bonheur: 2 } },
  { id: "fufu", nom: "Fufu, poisson salé, pondu", type: "nourriture", prix: 25, effet: { faim: 45, bonheur: 4 } },
  { id: "poulet", nom: "Poulet mayo et chikwangue", type: "nourriture", prix: 60, effet: { faim: 70, bonheur: 10 } },
  { id: "lait", nom: "Lait et bouillie pour bébé", type: "nourriture", prix: 15, effet: { faim: 40, bonheur: 3 }, maxAge: 4 },
  // vêtements (slot = partie du corps ; couleur = teinte du vêtement en 3D)
  { id: "tshirt-blanc", nom: "T-shirt blanc", type: "vetement", slot: "haut", prix: 60, couleur: "#f2efe9" },
  { id: "tshirt-leopards", nom: "Maillot des Léopards", type: "vetement", slot: "haut", prix: 120, couleur: "#1f8a4c" },
  { id: "chemise-bleue", nom: "Chemise bleu ciel", type: "vetement", slot: "haut", prix: 150, couleur: "#7fb2e5" },
  { id: "haut-rouge", nom: "Haut rouge", type: "vetement", slot: "haut", prix: 90, couleur: "#c8322f" },
  { id: "haut-jaune", nom: "Haut jaune soleil", type: "vetement", slot: "haut", prix: 90, couleur: "#f2c230" },
  { id: "jean", nom: "Jean bleu", type: "vetement", slot: "bas", prix: 120, couleur: "#33476b" },
  { id: "pantalon-noir", nom: "Pantalon noir", type: "vetement", slot: "bas", prix: 140, couleur: "#1d1d22" },
  { id: "pantalon-beige", nom: "Pantalon beige", type: "vetement", slot: "bas", prix: 130, couleur: "#c9b28c" },
  { id: "baskets-blanches", nom: "Baskets blanches", type: "vetement", slot: "pieds", prix: 180, couleur: "#eeeeee" },
  { id: "sandales", nom: "Sandales", type: "vetement", slot: "pieds", prix: 40, couleur: "#6b4a2f" },
  // téléphones
  { id: "tel-simple", nom: "Téléphone simple", type: "telephone", prix: 300, effet: { bonheur: 8 }, minAge: 10 },
  { id: "smartphone", nom: "Smartphone", type: "telephone", prix: 1500, effet: { bonheur: 15 }, minAge: 12 },
  { id: "smartphone-pro", nom: "Smartphone haut de gamme", type: "telephone", prix: 6000, effet: { bonheur: 25 }, minAge: 12 },
];

// vérifie un achat : renvoie un message d'erreur ou null
export function cannotBuy(item, makuta, age) {
  if (!item) return "Article inconnu.";
  if (item.minAge && age < item.minAge) return `Réservé aux ${item.minAge} ans et plus.`;
  if (item.maxAge && age > item.maxAge) return "Cet article est pour les tout-petits.";
  if (makuta < item.prix) return "Pas assez d'e-makuta.";
  return null;
}

// ---------------------------------------------------------------- argent réel (SIMULATION)
// Tant que REAL_MONEY est faux, aucun paiement n'est encaissé : les montants servent à présenter le modèle.
// L'activation demande l'avis d'un juriste, les autorisations (BCC, KYC, lutte anti-blanchiment) et un partenaire de paiement agréé.
export const REAL_MONEY = false;
// Taux validé : 1 $ = 5 e-makuta. Les montants sont stockés en « makuta » entiers (1 e-makuta = 20 makuta),
// ce qui permet des prix avec centimes (un beignet = 0,50 e-makuta) sans nombres à virgule en base.
export const USD_TO_MAKUTA = 5;            // affiché aux joueurs
export const UNITS_PER_MAKUTA = 20;        // makuta par e-makuta
export const USD_UNITS = USD_TO_MAKUTA * UNITS_PER_MAKUTA;   // makuta par dollar (100)
export const fmtMakuta = n => (n / UNITS_PER_MAKUTA).toLocaleString("fr-FR", { minimumFractionDigits: n % UNITS_PER_MAKUTA ? 2 : 0, maximumFractionDigits: 2 }) + " e-makuta";
export const WITHDRAW_FEE = 0.10;          // 10 % de frais au retrait (finance la ville et le service)
export const LOCK_DAYS = 90;               // argent bloqué 3 mois réels avant tout retrait
export const OFFERS = [
  { id: "bebe", nom: "Naissance (parcours normal)", type: "entree", usd: 100, desc: "Tu nais bébé dans une famille et tu grandis normalement." },
  { id: "parent", nom: "Naître parent", type: "entree", usd: 5000, desc: "Tu nais adulte (25 ans), tes talents sont déjà connus et tu reçois 250 e-makuta d'épargne.", age: 25, epargne: 5000 },
  { id: "petit", nom: "Petit investisseur", type: "investissement", usd: 1500, desc: "1 500 $ convertis en e-makuta pour acheter et créer des entreprises." },
  { id: "grand", nom: "Grand investisseur", type: "investissement", usd: 30000, desc: "30 000 $ convertis en e-makuta pour racheter de grandes entreprises." },
];

// âge réel (ms) à soustraire à la date de naissance pour naître à un âge donné
export function birthShiftMs(years) {
  const d = years <= CHILD_YEARS ? years / CHILD_YEARS * CHILD_REAL_DAYS : CHILD_REAL_DAYS + (years - CHILD_YEARS) / ADULT_YEARS_PER_REAL_DAY;
  return d * DAY;
}

// état du portefeuille : quand le retrait devient possible et combien on recevrait
export function walletInfo(deposits, makuta, now = Date.now()) {
  const first = deposits.length ? Math.min(...deposits.map(d => d.le)) : null;
  const unlock = first == null ? null : first + LOCK_DAYS * DAY;
  return {
    simulation: !REAL_MONEY, taux: USD_TO_MAKUTA, frais: WITHDRAW_FEE, blocageJours: LOCK_DAYS,
    deposeUsd: deposits.reduce((s, d) => s + d.usd, 0),
    retraitPossibleLe: unlock, retraitPossible: unlock != null && now >= unlock,
    valeurUsd: Math.floor(makuta / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100,
  };
}

// vue envoyée au joueur : catalogue, inventaire, portefeuille (même forme côté serveur et mode démo)
export function shopView(inv, dep, ret, makuta, now) {
  return {
    boutique: SHOP,
    inventaire: inv.map(x => ({ id: x.id, objet: x.objet_id, porte: !!x.porte, le: x.acquis_le })),
    portefeuille: { ...walletInfo(dep, makuta, now), offres: OFFERS, depots: dep, retraits: ret },
  };
}


// ---------------------------------------------------------------- famille et maison
// Tirées de la graine d'apparence : toujours la même famille pour un personnage, sans rien stocker de plus.
const JOBS_M = ["Enseignant", "Chauffeur de taxi", "Mécanicien", "Fonctionnaire", "Électricien", "Commerçant", "Pharmacien", "Maçon"];
const JOBS_F = ["Commerçante au marché", "Infirmière", "Couturière", "Enseignante", "Vendeuse de pagnes", "Coiffeuse", "Comptable", "Restauratrice"];
const HOUSES = [
  { type: "Maison en briques", pieces: 3, desc: "une parcelle avec une cour, un manguier et un portail bleu", mur: "#d9a066", toit: "#8a8f96", porte: "#2f5d8a" },
  { type: "Maison familiale", pieces: 4, desc: "une grande parcelle partagée avec les oncles, une cour en terre et un puits", mur: "#e6cf9f", toit: "#9b4a2c", porte: "#3c6e47" },
  { type: "Petite maison", pieces: 2, desc: "deux chambres et un salon, une petite cour avec des pots de fleurs", mur: "#c98b62", toit: "#7d8288", porte: "#7a3b2e" },
  { type: "Maison à étage", pieces: 5, desc: "une maison à étage avec un balcon et une clôture blanche", mur: "#efe6d6", toit: "#6b6f75", porte: "#1f4f7a", etage: true },
];
export function familyOf(c, age) {
  const r = rng((c.look ^ 0x5bd1e995) >>> 0);
  const pick = a => a[Math.floor(r() * a.length)];
  const fa = Math.floor(age + 26 + r() * 10), ma = Math.floor(age + 22 + r() * 8);
  const n = Math.floor(r() * 4);  // 0 à 3 frères et sœurs
  const sib = [];
  for (let i = 0; i < n; i++) {
    const f = r() < .5, d = Math.round((r() * 12 - 4) * 10) / 10;
    sib.push({ prenom: pick(f ? FIRST_F : FIRST_M), sexe: f ? "F" : "M", age: Math.max(0, Math.floor(age + (d === 0 ? 2 : d))), aine: d > 0 });
  }
  return {
    pere: { nom: c.father, age: fa, metier: pick(JOBS_M) },
    mere: { nom: c.mother, age: ma, metier: pick(JOBS_F) },
    fratrie: sib.sort((a, b) => b.age - a.age),
    maison: { ...pick(HOUSES), quartier: c.quartier },
  };
}

// ---------------------------------------------------------------- travail et salaires
// salaire = e-makuta par journée de travail ; une journée par tranche de 8 h réelles, elle fatigue.
// Un talent découvert dans le domaine du métier ajoute TALENT_BONUS au salaire.
export const SHIFT_HOURS = 8;
export const SHIFT_ENERGY = 35;
export const JOBS = [
  { id: "vendeur", nom: "Vendeur au marché de la Liberté", talent: "commerce", salaire: 120, minAge: 16 },
  { id: "taxi-moto", nom: "Chauffeur de taxi-moto", talent: "sport", salaire: 150, minAge: 18 },
  { id: "cuisinier", nom: "Cuisinier dans un maquis", talent: "cuisine", salaire: 140, minAge: 16 },
  { id: "aide-soignant", nom: "Aide-soignant au centre de santé", talent: "soin", salaire: 160, minAge: 18 },
  { id: "musicien", nom: "Musicien dans un orchestre", talent: "art", salaire: 130, minAge: 16 },
  { id: "mecanicien", nom: "Mécanicien au garage", talent: "technique", salaire: 170, minAge: 18 },
  { id: "animateur", nom: "Animateur à la radio", talent: "parole", salaire: 150, minAge: 18 },
  { id: "repetiteur", nom: "Répétiteur (cours du soir)", talent: "etudes", salaire: 140, minAge: 16 },
  // carrières qui demandent des études (ouvertes avec l'école et l'université)
  { id: "medecin", nom: "Médecin", talent: "soin", salaire: 600, minAge: 24, formation: "medecine", diplome: "Doctorat en médecine" },
  { id: "ingenieur", nom: "Ingénieur", talent: "technique", salaire: 500, minAge: 22, formation: "ingenieur", diplome: "Diplôme d'ingénieur civil" },
  { id: "avocat", nom: "Avocat", talent: "parole", salaire: 550, minAge: 22, formation: "droit", diplome: "Licence en droit" },
  { id: "enseignant", nom: "Enseignant au secondaire", talent: "etudes", salaire: 260, minAge: 18, formation: "secondaire", diplome: "Diplôme d'État" },
];
export function cannotApply(job, age, diplomas) {
  if (!job) return "Métier inconnu.";
  if (job.formation && !diplomas.includes(job.formation)) return `Il faut d'abord le diplôme : ${job.diplome}.`;
  if (age < job.minAge) return `Ce métier est ouvert dès ${job.minAge} ans.`;
  return null;
}
export function payFor(job, talents) {
  const t = talents.find(x => x.talent === job.talent && x.discovered);
  return { montant: Math.round(job.salaire * (t ? 1 + TALENT_BONUS : 1)), bonus: !!t };
}
export function cannotWork(job, age, energy, lastShift, now = Date.now()) {
  if (!job) return "Choisis d'abord un métier.";
  if (age < job.minAge) return `Ce métier est ouvert dès ${job.minAge} ans.`;
  if (lastShift && now - lastShift < SHIFT_HOURS * 36e5) return `Prochaine journée de travail dans ${Math.ceil((lastShift + SHIFT_HOURS * 36e5 - now) / 36e5)} h.`;
  if (energy < SHIFT_ENERGY) return "Trop fatigué pour travailler : repose-toi ou mange.";
  return null;
}
export function workView(jobId, lastShift, now = Date.now()) {
  return { metiers: JOBS, metier: jobId || null, prochainTravail: lastShift ? lastShift + SHIFT_HOURS * 36e5 : null, fatigueTravail: SHIFT_ENERGY };
}

// ---------------------------------------------------------------- école et diplômes
// Une année d'études = un nombre de cours. Un cours toutes les STUDY_HOURS heures réelles, il fatigue un peu.
// En fin d'année, la moyenne des cours doit atteindre PASS_MARK, sinon on redouble.
// Primaire et secondaire : payés par les parents. Université : frais par année, payés par cours.
export const STUDY_HOURS = 4;
export const STUDY_ENERGY = 15;
export const PASS_MARK = 55;
export const FORMATIONS = [
  { id: "primaire", nom: "École primaire", diplome: "Certificat d'études primaires", annees: 6, coursParAn: 6, minAge: 6, requis: null, fraisAn: 0, parents: true },
  { id: "secondaire", nom: "École secondaire (humanités)", diplome: "Diplôme d'État", annees: 6, coursParAn: 6, minAge: 11, requis: "primaire", fraisAn: 0, parents: true },
  { id: "medecine", nom: "Faculté de médecine (UNIKIN)", diplome: "Doctorat en médecine", annees: 7, coursParAn: 10, minAge: 17, requis: "secondaire", fraisAn: 2000, talent: "soin" },
  { id: "ingenieur", nom: "Polytechnique", diplome: "Diplôme d'ingénieur civil", annees: 5, coursParAn: 10, minAge: 17, requis: "secondaire", fraisAn: 1800, talent: "technique" },
  { id: "droit", nom: "Faculté de droit", diplome: "Licence en droit", annees: 5, coursParAn: 10, minAge: 17, requis: "secondaire", fraisAn: 1500, talent: "parole" },
  { id: "commerce", nom: "Institut de commerce", diplome: "Graduat en gestion", annees: 3, coursParAn: 10, minAge: 17, requis: "secondaire", fraisAn: 1200, talent: "commerce" },
];
export const courseFee = f => Math.ceil(f.fraisAn / f.coursParAn);

export function cannotEnroll(f, age, diplomas, current) {
  if (!f) return "Formation inconnue.";
  if (current) return "Termine d'abord ta formation en cours.";
  if (diplomas.includes(f.id)) return "Tu as déjà ce diplôme.";
  if (age < f.minAge) return `Inscription possible dès ${f.minAge} ans.`;
  if (f.requis && !diplomas.includes(f.requis)) return `Il faut d'abord : ${FORMATIONS.find(x => x.id === f.requis).diplome}.`;
  return null;
}

// un cours : renvoie la nouvelle inscription et, éventuellement, la fin d'année ou le diplôme
export function attendCourse(f, enr, talents, makuta, energy, now, r) {
  if (enr.dernier && now - enr.dernier < STUDY_HOURS * 36e5) return { error: `Prochain cours dans ${Math.ceil((enr.dernier + STUDY_HOURS * 36e5 - now) / 36e5)} h.` };
  if (energy < STUDY_ENERGY) return { error: "Trop fatigué pour aller en cours : repose-toi ou mange." };
  const fee = f.parents ? 0 : courseFee(f);
  if (makuta < fee) return { error: `Pas assez d'argent pour les frais du cours (${fmtMakuta(fee)}).` };
  const has = id => talents.some(t => t.talent === id && t.discovered);
  const note = Math.min(100, Math.round(42 + r() * 40 + (has("etudes") ? 14 : 0) + (f.talent && has(f.talent) ? 8 : 0)));
  const e = { ...enr, cours: enr.cours + 1, points: enr.points + note, dernier: now };
  let message = `Cours suivi : note ${note}/100.`, fin = null;
  if (e.cours >= f.coursParAn) {
    const moy = Math.round(e.points / e.cours);
    if (moy >= PASS_MARK) {
      if (e.annee >= f.annees) { fin = { diplome: f.id, note: moy }; message = `Diplôme obtenu : ${f.diplome} (moyenne ${moy}/100) !`; }
      else { message = `Année ${e.annee} réussie avec ${moy}/100. Passage en année ${e.annee + 1}.`; e.annee++; }
    } else message = `Année ${e.annee} ratée (${moy}/100) : il faut redoubler.`;
    e.cours = 0; e.points = 0;
  }
  return { enr: e, fee, note, message, fin };
}

export function schoolView(enr, diplomas, now = Date.now()) {
  return {
    formations: FORMATIONS.map(f => ({ ...f, fraisCours: f.parents ? 0 : courseFee(f) })),
    diplomes: diplomas,
    enCours: enr ? { ...enr, prochainCours: enr.dernier ? enr.dernier + STUDY_HOURS * 36e5 : null } : null,
    fatigueCours: STUDY_ENERGY, moyenneRequise: PASS_MARK,
  };
}

// ---------------------------------------------------------------- familles de joueurs
// Un bébé naît chez un parent joueur qui accepte d'accueillir des enfants (sinon dans une famille du jeu).
// Jusqu'à 18 ans, le parent verse chaque jour l'entretien de l'enfant ; s'il ne peut pas payer, l'enfant en souffre.
// Devenu adulte, l'enfant reverse FAMILY_SHARE de chaque salaire à ses parents.
export const SUPPORT_PER_DAY = 60;      // makuta par jour réel (3 e-makuta)
export const FAMILY_SHARE = 0.10;
export const HOST_MIN_AGE = 20;
export const MAX_CHILDREN = 4;
export function supportDue(lastPaid, bornAt, now = Date.now()) {
  const from = lastPaid || bornAt, days = Math.floor((now - from) / DAY);
  return { days, due: days * SUPPORT_PER_DAY, next: from + (days + 1) * DAY };
}
// effet d'un entretien impayé : bonheur et santé baissent
export function unpaidEffect(days) { return { bonheur: 12 * days, sante: 4 * days }; }
export function familyShare(amount) { return Math.round(amount * FAMILY_SHARE); }
