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

// Naissance (parcours normal) : 15 $ payés une seule fois à l'inscription.
// 5 $ restent à l'administrateur pour faire vivre le jeu ; les 10 $ restants (50 e-makuta) sont confiés aux parents,
// qui gèrent l'argent de l'enfant et sont libres de le lui donner ou non.
export const BIRTH_USD = 15, ADMIN_FEE_USD = 5;
export const BIRTH_GIFT = (BIRTH_USD - ADMIN_FEE_USD) * 100; // makuta (100 par $) : 1 000 makuta = 50 e-makuta

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
  { id: "bebe", nom: "Naissance (parcours normal)", type: "entree", usd: BIRTH_USD, fraisAdmin: ADMIN_FEE_USD, desc: "Tu nais bébé dans une famille et tu grandis normalement. Sur les 15 $, 5 $ font vivre le jeu et 10 $ (50 e-makuta) sont confiés à tes parents, qui gèrent ton argent." },
  { id: "parent", nom: "Naître parent", type: "entree", usd: 5000, desc: "Tu nais adulte (25 ans), tes talents sont déjà connus et tu reçois 250 e-makuta d'épargne.", age: 25, epargne: 5000 },
  { id: "petit", nom: "Petit investisseur", type: "investissement", usd: 1500, age: 30, desc: "1 500 $ convertis en e-makuta pour acheter et créer des entreprises." },
  { id: "grand", nom: "Grand investisseur", type: "investissement", usd: 30000, age: 35, desc: "30 000 $ convertis en e-makuta pour racheter de grandes entreprises." },
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
  if (job.elu) return "Ce poste s'obtient par élection.";
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
// L'enfant se souvient d'avoir été négligé : devenu adulte, il reverse moins à ses parents (10 % → 2 % après 7 jours de négligence).
export function familyShareRate(neglectDays = 0) { return FAMILY_SHARE - 0.08 * Math.min(1, neglectDays / NEGLECT_DANGER_DAYS); }
export function familyShare(amount, neglectDays = 0) { return Math.round(amount * familyShareRate(neglectDays)); }
// Un enfant dont on ne s'occupe pas (entretien impayé, faim) peut voler pour survivre, dès NEGLECT_STEAL_AGE ans.
// C'est au joueur réel responsable de s'assurer qu'il ne manque de rien.
export const NEGLECT_STEAL_AGE = 8;
// Après 7 jours réels de négligence (cumulés), l'enfant est en danger de mort : sa santé chute vite.
export const NEGLECT_DANGER_DAYS = 7, NEGLECT_DANGER_HEALTH = 15;

// ---------------------------------------------------------------- mort et héritage
// La mort est définitive. Quand la santé tombe à 0, le personnage meurt et sa fortune est partagée :
// 20 % gardés par le joueur pour sa prochaine vie, 10 % de frais de succession pour la ville,
// 70 % aux héritiers (enfants et parents vivants à parts égales ; sinon le conjoint ; sinon la ville).
export const ESTATE = { report: 0.20, ville: 0.10, heritiers: 0.70 };
export function splitEstate(total, heirs) {
  const report = Math.floor(total * ESTATE.report), ville = Math.floor(total * ESTATE.ville);
  const pot = total - report - ville, each = heirs > 0 ? Math.floor(pot / heirs) : 0;
  return { report, ville: ville + (pot - each * heirs), each, heritiers: each * heirs };
}
export function deathCause(needs, neglectDays = 0) {
  if (needs.health > 0) return null;
  if (neglectDays >= NEGLECT_DANGER_DAYS) return "négligé par sa famille";
  return needs.hunger < 15 ? "mort de faim" : "maladie non soignée";
}
export function neglectStealChance(unpaidDays, hunger) {
  if (unpaidDays < 1) return 0;
  return Math.min(0.6, 0.12 * unpaidDays + (hunger < 30 ? 0.15 : 0));
}

// ---------------------------------------------------------------- lancement du jeu
// Le jeu ne s'ouvre aux naissances qu'une fois toutes les conditions réunies ; l'administrateur appuie alors sur « Démarrer ».
// Pour ajouter une condition plus tard : une ligne ici, et son compteur côté serveur (launchCounts).
export const LAUNCH_RULES = [
  { id: "parents", label: "Parents fondateurs ajoutés par l'administrateur", min: 20 },
  { id: "investisseurs", label: "Investisseurs inscrits", min: 10 },
  { id: "entreprises", label: "Entreprises ouvertes", min: 20 },
  { id: "date", label: "Date d'ouverture officielle", min: 1 },
];
// counts : { parents, investisseurs, entreprises } ; openingDate : date fixée par l'administrateur (ms) ou null
export function launchStatus(counts, startedAt, openingDate = null, now = Date.now()) {
  const c = { ...counts, date: openingDate && now >= openingDate ? 1 : 0 };
  const conditions = LAUNCH_RULES.map(r => ({ ...r, actuel: c[r.id] || 0, ok: (c[r.id] || 0) >= r.min }));
  return { demarre: !!startedAt, demarreLe: startedAt || null, dateOuverture: openingDate || null, pret: conditions.every(x => x.ok), conditions };
}
// avant le lancement, seuls les investisseurs peuvent s'inscrire (les parents fondateurs sont créés par l'administrateur)
export function canSignupBeforeLaunch(formule) { return OFFERS.some(o => o.id === formule && o.type === "investissement"); }

// ---------------------------------------------------------------- entreprises
// prix en makuta (20 makuta = 1 e-makuta). Les recettes et les embauches viendront à l'étape suivante.
// recette : ce que la caisse gagne seule par jour réel ; job/salaire : le poste proposé aux autres joueurs ; places : employés maximum
export const COMPANY_TYPES = [
  { id: "salon", nom: "Salon de coiffure", icone: "💇🏾", prix: 16000, recette: 480, job: "coiffeur", poste: "Coiffeur", talent: "art", salaire: 160, places: 2, desc: "Coiffure et tresses dans ton quartier." },
  { id: "boutique", nom: "Boutique", icone: "🏪", prix: 20000, recette: 600, job: "vendeur", poste: "Vendeur en boutique", talent: "commerce", salaire: 150, places: 2, desc: "Vente de produits de tous les jours." },
  { id: "maquis", nom: "Maquis", icone: "🍲", prix: 30000, recette: 900, job: "cuisinier", poste: "Cuisinier", talent: "cuisine", salaire: 170, places: 3, desc: "Restaurant populaire : les joueurs viennent y manger." },
  { id: "taxi", nom: "Taxi", icone: "🚕", prix: 50000, recette: 1500, job: "chauffeur", poste: "Chauffeur de taxi", talent: "sport", salaire: 190, places: 2, desc: "Les joueurs paient leurs courses en ville à ton taxi." },
  { id: "pharmacie", nom: "Pharmacie", icone: "💊", prix: 100000, recette: 3000, job: "pharmacien", poste: "Vendeur en pharmacie", talent: "soin", salaire: 220, places: 3, desc: "Médicaments pour soigner les joueurs malades." },
  { id: "ecole", nom: "École privée", icone: "🏫", prix: 400000, recette: 12000, job: "professeur", poste: "Professeur", talent: "etudes", salaire: 300, places: 6, desc: "Accueille des élèves et emploie des enseignants." },
  { id: "supermarche", nom: "Supermarché", icone: "🛒", prix: 800000, recette: 24000, job: "caissier", poste: "Caissier", talent: "commerce", salaire: 240, places: 8, desc: "Grand magasin qui approvisionne la ville." },
  { id: "hotel", nom: "Hôtel", icone: "🏨", prix: 1600000, recette: 48000, job: "receptionniste", poste: "Réceptionniste", talent: "parole", salaire: 260, places: 10, desc: "Chambres, restaurant et salles de fête." },
];
// la caisse se remplit seule pendant 7 jours au plus : au-delà, le patron doit passer encaisser
export const COMPANY_CAP_DAYS = 7;
// chaque journée d'un employé rapporte à la caisse son salaire + 60 % (le salaire est payé par la caisse)
export const EMPLOYEE_YIELD = 1.6;
export const RESELL_RATE = 0.5;      // revendre un objet : la moitié de son prix
export const TAXI_FARE = 200;        // course en taxi dans Kinshasa (10 e-makuta)
export const TAXI_ENERGY = 5;
export const KINSHASA_QUARTIERS = ["Gombe", "Lingwala", "Kinshasa", "Barumbu", "Kalamu", "Limete", "Kasa-Vubu", "Bandalungwa", "Matonge", "Ngaliema", "Masina", "Lemba"];
export const OTHER_CITIES = ["Lubumbashi", "Goma", "Kisangani", "Matadi"];
export function companyAccrue(e, now = Date.now()) {
  const t = COMPANY_TYPES.find(x => x.id === e.type), since = e.maj_le || e.cree_le;
  const days = Math.max(0, now - since) / 864e5, capped = Math.min(days, COMPANY_CAP_DAYS);
  const gain = Math.floor((t ? t.recette : 0) * capped);
  return { caisse: (e.caisse || 0) + gain, maj_le: now, plein: days >= COMPANY_CAP_DAYS };
}
// un emploi dans l'entreprise d'un joueur, au format des métiers
export function companyJob(e) {
  const t = COMPANY_TYPES.find(x => x.id === e.type);
  return t && { id: t.job, nom: `${t.poste} · ${e.nom}`, talent: t.talent, salaire: t.salaire, minAge: 18, entreprise: e.id };
}
export const COMPANY_MIN_AGE = 18;
export function cannotOpenCompany(type, age, makuta) {
  if (!type) return "Type d'entreprise inconnu.";
  if (age < COMPANY_MIN_AGE) return `Il faut avoir ${COMPANY_MIN_AGE} ans pour ouvrir une entreprise.`;
  if (makuta < type.prix) return `Il te faut ${fmtMakuta(type.prix)} pour ouvrir ce commerce.`;
  return null;
}
export function companyName(type, ownerLastName, name) {
  const n = String(name || "").trim().slice(0, 40);
  return n.length >= 2 ? n : `${type.nom} ${ownerLastName}`;
}
export function companyView(list, extra = {}, now = Date.now()) {
  const deco = e => { const t = COMPANY_TYPES.find(x => x.id === e.type) || {}; return { ...e, typeNom: t.nom, icone: t.icone }; };
  return {
    types: COMPANY_TYPES, plafondJours: COMPANY_CAP_DAYS,
    miennes: list.map(e => { const a = companyAccrue(e, now); return { ...deco(e), caisse: a.caisse, plein: a.plein }; }),
    aVendre: (extra.aVendre || []).map(deco),
    offres: (extra.offres || []).map(e => ({ ...deco(e), emploi: companyJob(e) })),
  };
}

// ---------------------------------------------------------------- l'État et les services publics
// Les institutions sont celles d'un État comme la RDC ; les banques, assureurs et opérateurs sont des noms inventés pour le jeu.
export const STATE_ID = "etat";                    // compte du Trésor public dans le grand livre
export const TAX = { salaire: 0.05, recettes: 0.10, douane: 0.10 };   // IPR sur salaires, impôt sur les recettes, droits de douane
export const INSTITUTIONS = [
  { id: "presidence", nom: "Présidence de la République", icone: "🏛️", role: "Le Président est élu par les joueurs. Il nomme le gouvernement et fixe les grandes règles de la ville." },
  { id: "assemblee", nom: "Assemblée nationale", icone: "🗳️", role: "Les députés élus votent les lois du jeu : impôts, salaires publics, amendes." },
  { id: "senat", nom: "Sénat", icone: "📜", role: "Les sénateurs relisent les lois et représentent les villes." },
  { id: "gouvernement", nom: "Gouvernement et ministères", icone: "🏢", role: "Santé, éducation, transports : ils gèrent le budget payé par les impôts." },
  { id: "police", nom: "Police nationale", icone: "🚓", role: "Elle protège les joueurs, dresse les amendes et peut envoyer en prison. Elle recrute des policiers." },
  { id: "justice", nom: "Cours et tribunaux", icone: "⚖️", role: "Ils jugent les litiges entre joueurs et les infractions." },
  { id: "dgi", nom: "DGI (Direction générale des impôts)", icone: "🧾", role: "Elle prélève 5 % sur chaque salaire et 10 % sur les recettes des entreprises." },
  { id: "dgda", nom: "DGDA (douanes et accises)", icone: "🛃", role: "Elle prélève 10 % sur les produits importés, comme les téléphones, et plus tard sur les marchandises entre villes." },
  { id: "banque-centrale", nom: "Banque centrale", icone: "🏦", role: "Elle émet l'e-makuta, fixe le taux (1 $ = 5 e-makuta) et surveille les banques." },
];
// postes électifs : candidatures ouvertes, élections après le lancement
export const POSTS = [
  { id: "president", nom: "Président de la République", places: 1, minAge: 30 },
  { id: "senateur", nom: "Sénateur", places: 109, minAge: 30 },
  { id: "depute", nom: "Député national", places: 500, minAge: 25 },
];
// métiers publics, payés par le Trésor
export const PUBLIC_JOBS = [
  { id: "policier", nom: "Policier", talent: "sport", salaire: 200, minAge: 18, institution: "police" },
  { id: "agent-dgi", nom: "Agent des impôts (DGI)", talent: "commerce", salaire: 220, minAge: 21, institution: "dgi", formation: "commerce", diplome: "Licence en commerce" },
  { id: "douanier", nom: "Douanier (DGDA)", talent: "commerce", salaire: 220, minAge: 21, institution: "dgda" },
  { id: "agent-bc", nom: "Agent de la Banque centrale", talent: "etudes", salaire: 320, minAge: 23, institution: "banque-centrale", formation: "commerce", diplome: "Licence en commerce" },
];
JOBS.push(...PUBLIC_JOBS);
// banques commerciales : l'épargne rapporte des intérêts chaque jour réel
export const BANKS = [
  { id: "fleuve", nom: "Banque du Fleuve", icone: "🏦", taux: 0.002, desc: "Grande banque de la Gombe. 0,2 % d'intérêts par jour." },
  { id: "equateur", nom: "Banque de l'Équateur", icone: "🏦", taux: 0.0015, desc: "Agences dans tous les quartiers. 0,15 % par jour." },
  { id: "likelemba", nom: "Coopérative Likelemba", icone: "🤝", taux: 0.003, plafond: 200000, desc: "Épargne de quartier, 0,3 % par jour, jusqu'à 10 000 e-makuta." },
];
export function bankAccrue(acc, now = Date.now()) {
  const b = BANKS.find(x => x.id === acc.banque), days = Math.max(0, now - (acc.maj_le || now)) / 864e5;
  return Math.floor(acc.solde * (1 + (b ? b.taux : 0) * days));
}
// assurances : une semaine de couverture santé, les soins coûtent alors 20 %
export const INSURERS = [
  { id: "kongo-sante", nom: "Kongo Santé", icone: "🩺", prime: 1400, jours: 7, couverture: 0.8, desc: "Assurance santé : 70 e-makuta la semaine, 80 % des soins remboursés." },
  { id: "mutuelle", nom: "Mutuelle des Travailleurs", icone: "🛡️", prime: 1000, jours: 7, couverture: 0.6, desc: "Moins chère : 50 e-makuta la semaine, 60 % des soins remboursés." },
];
export const CARE = { prix: 2000, sante: 40 };    // consultation et médicaments au centre de santé
export function careCost(insuredUntil, insurerId, now = Date.now()) {
  const ins = insuredUntil && insuredUntil > now && INSURERS.find(x => x.id === insurerId);
  return { prix: Math.round(CARE.prix * (ins ? 1 - ins.couverture : 1)), assure: !!ins };
}
// réseaux de communication : on achète du crédit chez un opérateur, un appel coûte 1 e-makuta et rend heureux
export const OPERATORS = [
  { id: "mbote", nom: "Mbote Télécom", couleur: "#e0603a" },
  { id: "kinnet", nom: "KinNet Mobile", couleur: "#2d7bff" },
  { id: "lisanga", nom: "Lisanga", couleur: "#4fc58a" },
];
export const RECHARGES = [200, 1000, 2000];         // en makuta (10, 50, 100 e-makuta)
export const CALL = { prix: 20, bonheur: 6 };
export function stateView(me, pub, now = Date.now()) {
  return {
    institutions: INSTITUTIONS, postes: POSTS.map(x => ({ ...x, candidats: (pub.candidats || {})[x.id] || 0 })), impots: TAX,
    tresor: pub.tresor || 0, masse: pub.masse || 0, tauxUsd: USD_TO_MAKUTA,
    banques: BANKS.map(b => { const a = (me.comptes || []).find(x => x.banque === b.id); return { ...b, solde: a ? bankAccrue(a, now) : 0 }; }),
    assureurs: INSURERS, assurance: me.assureJusqu && me.assureJusqu > now ? { id: me.assureur, jusqua: me.assureJusqu } : null,
    soins: { ...CARE, ...careCost(me.assureJusqu, me.assureur, now) },
    operateurs: OPERATORS, operateur: me.operateur || null, credit: me.credit || 0, recharges: RECHARGES, appel: CALL,
    candidature: me.candidature || null, metiersPublics: PUBLIC_JOBS,
  };
}

// ---------------------------------------------------------------- élections
// Un vote tous les 6 mois réels après le démarrage du jeu. Le vote dure 7 jours et se termine à la date de l'élection.
export const ELECTION_EVERY = 182.5 * 864e5;
export const VOTE_DAYS = 7;
export const VOTER_MIN_AGE = 18;
export const ELECTED_PAY = { president: 1200, senateur: 600, depute: 500 };   // indemnité par journée de travail, payée par le Trésor
POSTS.forEach(x => JOBS.push({ id: "elu-" + x.id, nom: x.nom + " (élu)", talent: "parole", salaire: ELECTED_PAY[x.id], minAge: x.minAge, elu: true }));
// calendrier : la prochaine élection est enregistrée (date, numéro du cycle) ; le vote ouvre 7 jours avant
export function electionCalendar(nextDate, cycle, now = Date.now()) {
  if (!nextDate) return { cycle: 0, prochaine: null, ouvertureVote: null, voteOuvert: false };
  const open = nextDate - VOTE_DAYS * 864e5;
  return { cycle, prochaine: nextDate, ouvertureVote: open, voteOuvert: now >= open && now < nextDate };
}
// dépouillement : pour chaque poste, les candidats ayant le plus de voix prennent les sièges
export function tally(votes, candidates) {
  const out = {};
  for (const po of POSTS) {
    const c = candidates.filter(x => x.poste === po.id).map(x => ({ ...x, voix: votes.filter(v => v.poste === po.id && v.candidat_id === x.personnage_id).length }));
    out[po.id] = c.filter(x => x.voix > 0).sort((a, b) => b.voix - a.voix || a.le - b.le).slice(0, po.places);
  }
  return out;
}

// ---------------------------------------------------------------- police, amendes et prison
export const CRIMES = [
  { id: "vol-marche", nom: "Voler au marché", gain: [400, 1600], risque: 0.4, amende: 2000, desc: "Rapporte de 20 à 80 e-makuta, mais la police attrape 4 voleurs sur 10." },
  { id: "fraude-taxi", nom: "Partir sans payer le taxi", gain: [200, 200], risque: 0.3, amende: 1000, desc: "Économise une course, mais 3 fois sur 10 la police te verbalise." },
];
export const PRISON_HOURS = 24;          // une journée réelle en prison
export const BAIL = 10000;               // caution pour sortir plus tôt (500 e-makuta)
export const RECIDIVE = { fois: 3, jours: 30 };   // 3 infractions en 30 jours = prison
export const POLICE_BONUS = 0.05;        // chaque policier joueur augmente le risque d'être attrapé (80 % au plus)
export function catchChance(crime, policiers) { return Math.min(0.8, crime.risque + POLICE_BONUS * (policiers || 0)); }
// que se passe-t-il quand on est attrapé ?
export function sentence(crime, makuta, recentOffences) {
  const prison = recentOffences + 1 >= RECIDIVE.fois || makuta < crime.amende;
  return { amende: Math.min(makuta, crime.amende), prison, heures: prison ? PRISON_HOURS : 0 };
}
export function inPrison(until, now = Date.now()) { return !!until && until > now; }
// en prison : pas de travail, d'école, de voyage, de magasin (sauf manger), ni d'affaires
export const PRISON_BLOCKED = ["/api/travailler", "/api/ecole/cours", "/api/ecole/inscription", "/api/voyager", "/api/entreprise/ouvrir", "/api/entreprise/acheter", "/api/postuler", "/api/crime", "/api/telephone/appeler"];
export function policeView(me, now = Date.now()) {
  return {
    crimes: CRIMES.map(c => ({ ...c, chance: catchChance(c, me.policiers) })), caution: BAIL, prisonHeures: PRISON_HOURS, recidive: RECIDIVE,
    prisonJusqu: inPrison(me.prisonJusqu, now) ? me.prisonJusqu : null, casier: me.casier || [], policiers: me.policiers || 0,
  };
}

// ---------------------------------------------------------------- consignes du jour
// Le joueur réel parle à son personnage par des consignes. Elles s'appliquent toute la journée,
// même quand il n'est pas connecté. Le nombre de consignes par jour est limité, et une consigne
// donnée ne peut plus être retirée avant le lendemain.
export const ORDERS = [
  { id: "travailler", icone: "🛠️", nom: "Aller travailler dès que possible", desc: "Fait sa journée de travail dès que l'énergie le permet." },
  { id: "manger", icone: "🍲", nom: "Manger au maquis quand j'ai faim", desc: "Dès que la faim descend sous 40." },
  { id: "etudier", icone: "🎓", nom: "Aller en cours dès que possible", desc: "Suit le prochain cours de sa formation." },
  { id: "soigner", icone: "🩺", nom: "Me soigner si ma santé baisse", desc: "Va au centre de santé sous 50 de santé." },
  { id: "encaisser", icone: "💰", nom: "Encaisser les recettes de mes entreprises", desc: "Vide les caisses pleines une fois par jour." },
  { id: "appeler", icone: "📱", nom: "Appeler ma famille si je suis triste", desc: "Sous 50 de bonheur, avec un téléphone et du crédit." },
  { id: "epargner", icone: "🏦", nom: "Épargner à la banque", desc: "Garde 100 e-makuta sur soi et place le reste dans la banque qui rapporte le plus." },
  { id: "enfants", icone: "👶", nom: "M'occuper de mes enfants", desc: "Donne à manger à chaque enfant mineur qui a faim (sous 50)." },
];
export const ORDER_DONE = { travailler: "Journée de travail faite.", manger: "A mangé au maquis.", etudier: "A suivi un cours.", soigner: "S'est soigné au centre de santé.", encaisser: "A encaissé les recettes.", appeler: "A appelé sa famille.", epargner: "A placé son argent à la banque.", enfants: "A donné à manger aux enfants." };
export const SAVE_KEEP = 2000;   // l'épargne automatique laisse 100 e-makuta sur soi
export const ORDERS_PER_DAY = 3;
export const ORDERS_CHECK_MS = 10 * 60e3;   // les consignes sont vérifiées toutes les 10 minutes au plus
// jour de Kinshasa (UTC+1) : les consignes repartent à zéro à minuit
export const dayKey = (now = Date.now()) => new Date(now + 36e5).toISOString().slice(0, 10);
// à partir de l'écran du personnage (même forme côté serveur et démo), quelles actions lancer maintenant ?
export function ordersToRun(orders, v, now = Date.now(), doneToday = []) {
  const p = v.perso, n = p.besoins, out = [];
  if (v.police && v.police.prisonJusqu) return out.concat(orders.includes("manger") && n.hunger < 40 ? [["manger", "/api/manger", {}]] : []);
  for (const id of orders) {
    if (id === "manger" && n.hunger < 40) out.push([id, "/api/manger", {}]);
    if (id === "soigner" && n.health < 50) out.push([id, "/api/soigner", {}]);
    if (id === "appeler" && n.happiness < 50 && v.etat && v.etat.credit >= 20) out.push([id, "/api/telephone/appeler", {}]);
    if (id === "travailler" && (v.travail.metier || v.travail.emploiEntreprise) && (!v.travail.prochainTravail || v.travail.prochainTravail <= now) && n.energy >= v.travail.fatigueTravail) out.push([id, "/api/travailler", {}]);
    if (id === "etudier" && v.ecole.enCours && (!v.ecole.enCours.prochainCours || v.ecole.enCours.prochainCours <= now) && n.energy >= v.ecole.fatigueCours) out.push([id, "/api/ecole/cours", {}]);
    if (id === "epargner" && p.age >= 16 && p.makuta - SAVE_KEEP >= 20 && v.etat) {
      let reste = p.makuta - SAVE_KEEP;
      for (const b of [...v.etat.banques].sort((x, y) => y.taux - x.taux)) {
        const m = Math.min(reste, b.plafond ? b.plafond - b.solde : reste);
        if (m >= 20) { out.push([id, "/api/banque/deposer", { banque: b.id, montant: m }]); reste -= m; }
        if (reste < 20) break;
      }
    }
    if (id === "enfants") {
      const repas = (v.boutique || []).filter(x => x.type === "nourriture" && (x.effet || {}).faim >= 40).sort((a, b) => a.prix - b.prix)[0];
      for (const k of v.enfants || []) if (repas && k.age < 18 && k.besoins.hunger < 50) out.push([id, "/api/enfant/nourrir", { enfant: k.id, objet: repas.id }]);
    }
    if (id === "encaisser" && !doneToday.includes("encaisser")) for (const e of (v.entreprises && v.entreprises.miennes) || []) if (e.caisse > 0) out.push([id, "/api/entreprise/encaisser", { entreprise: e.id }]);
  }
  return out;
}
export function cannotGiveOrder(id, today) {
  if (!ORDERS.some(o => o.id === id)) return "Consigne inconnue.";
  if (today.includes(id)) return "Cette consigne est déjà dans ton programme du jour.";
  if (today.length >= ORDERS_PER_DAY) return `Tu as déjà donné tes ${ORDERS_PER_DAY} consignes aujourd'hui. Reviens demain.`;
  return null;
}

// ---------------------------------------------------------------- mouvements du personnage
// Chaque action réussie (faite par le joueur ou par une consigne) est inscrite dans le journal des mouvements.
export function describeAction(path, body = {}, r = {}) {
  const nm = (list, id) => (list.find(x => x.id === id) || {}).nom || (list.find(x => x.id === id) || {}).label || id;
  const pay = r.paie ? fmtMakuta(r.paie.montant - (r.paie.famille || 0) - (r.paie.impot || 0)) : "";
  const kid = r.enfants && (r.enfants.find(k => k.id === body.enfant) || {}).prenom;
  const D = {
    "/api/activite": () => ["🎲", "Activité : " + nm(ACTIVITIES, body.activite)],
    "/api/manger": () => ["🍲", "A mangé au maquis"],
    "/api/acheter": () => ["🛍️", "A acheté : " + nm(SHOP, body.objet)],
    "/api/porter": () => ["👕", "A changé de tenue : " + nm(SHOP, body.objet)],
    "/api/revendre": () => ["🏷️", `A revendu ${r.vendu || "un objet"}${r.gain ? " pour " + fmtMakuta(r.gain) : ""}`],
    "/api/postuler": () => ["💼", body.entreprise ? "Embauché dans une entreprise" : "Nouveau métier : " + nm(JOBS, body.metier)],
    "/api/travailler": () => ["🛠️", `Journée de travail${pay ? " : +" + pay : ""}`],
    "/api/ecole/inscription": () => ["🎓", "Inscrit à l'école : " + nm(FORMATIONS, body.formation)],
    "/api/ecole/cours": () => ["📚", "A suivi un cours"],
    "/api/entreprise/ouvrir": () => ["🏪", "A ouvert l'entreprise " + (r.ouverte || "")],
    "/api/entreprise/encaisser": () => ["💰", "A encaissé les recettes" + (r.encaisse ? " : +" + fmtMakuta(r.encaisse) : "")],
    "/api/entreprise/vendre": () => ["🤝", body.prix == null ? "A retiré son entreprise de la vente" : "A mis son entreprise en vente pour " + fmtMakuta(body.prix)],
    "/api/entreprise/acheter": () => ["🤝", "A racheté l'entreprise " + (r.achetee || "")],
    "/api/voyager": () => ["🚕", "Taxi jusqu'à " + (r.arrive || body.quartier)],
    "/api/banque/deposer": () => ["🏦", `Dépôt de ${fmtMakuta(body.montant)} à ${nm(BANKS, body.banque)}`],
    "/api/banque/retirer": () => ["🏦", `Retrait de ${fmtMakuta(body.montant)} à ${nm(BANKS, body.banque)}`],
    "/api/assurance": () => ["🩺", "Assurance santé : " + nm(INSURERS, body.assureur)],
    "/api/soigner": () => ["🩺", "S'est soigné au centre de santé" + (r.soins ? " (" + fmtMakuta(r.soins.prix) + ")" : "")],
    "/api/telephone/recharger": () => ["📶", `Recharge de ${fmtMakuta(body.montant)} chez ${nm(OPERATORS, body.operateur)}`],
    "/api/telephone/appeler": () => ["📱", "A appelé sa famille"],
    "/api/candidature": () => ["🗳️", body.poste ? "Candidat au poste de " + nm(POSTS, body.poste).toLowerCase() : "A retiré sa candidature"],
    "/api/voter": () => ["🗳️", "A voté (vote secret)"],
    "/api/crime": () => ["🚨", r.crime && r.crime.attrape ? `Attrapé par la police : amende de ${fmtMakuta(r.crime.amende)}${r.crime.prison ? " et prison" : ""}` : `${nm(CRIMES, body.crime)} : +${fmtMakuta((r.crime || {}).gain || 0)}`],
    "/api/caution": () => ["🔓", "A payé la caution et quitté la prison"],
    "/api/accueil": () => ["🏠", body.actif ? "Accepte d'accueillir des enfants" : "N'accueille plus d'enfants"],
    "/api/enfant/nourrir": () => ["👶", `A donné à manger à ${kid || "son enfant"}`],
    "/api/investir": () => ["💼", "Investissement (simulé)"],
    "/api/retirer": () => ["💵", "Retrait vers l'argent réel (simulé)"],
    "/api/consigne": () => ["📋", "Consigne du jour : " + nm(ORDERS, body.ordre)],
  };
  const f = D[path]; if (!f) return null;
  const [icone, texte] = f(); return { icone, texte };
}
