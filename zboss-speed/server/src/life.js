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
  const hunger = Math.max(0, c.hunger - h * 4 * SET.faim); // la faim baisse de 4 points par heure réelle (réglable par l'admin)
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
// toutes les communes de la ville-province de Kinshasa (+ Matonge, quartier célèbre de Kalamu) : voir COMMUNES plus bas
const QUARTIERS = () => COMMUNES.map(c => c.nom);

export function newIdentity(r, sex) {
  const s = sex || (r() < 0.5 ? "F" : "M");
  const pick = a => a[Math.floor(r() * a.length)];
  const last = pick(LAST);
  return {
    sex: s,
    firstName: pick(s === "F" ? FIRST_F : FIRST_M),
    lastName: last,
    quartier: pick(QUARTIERS()),
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
export const OFFERS = [
  { id: "bebe", nom: "Naissance (le jeu décide)", type: "entree", usd: BIRTH_USD, fraisAdmin: ADMIN_FEE_USD, desc: "Le jeu décide de ton arrivée : bébé dans une famille, ou jeune adulte qui doit d'abord grandir. Ta classe sociale et tes études de départ sont tirées au sort. Sur les 15 $, 5 $ font vivre le jeu et 10 $ (50 e-makuta) te sont confiés (à tes parents si tu nais bébé)." },
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
// Retrait : chaque fin de mois (les derniers jours du mois, heure de Kinshasa), une fois par mois, à tout âge.
export const WITHDRAW_WINDOW_DAYS = 3;
const KIN_MS = 36e5;   // Kinshasa = UTC+1
export function withdrawWindow(now = Date.now()) {
  const k = new Date(now + KIN_MS), y = k.getUTCFullYear(), m = k.getUTCMonth();
  const startOf = (yy, mm) => Date.UTC(yy, mm, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate() - WITHDRAW_WINDOW_DAYS + 1) - KIN_MS;
  const start = startOf(y, m), end = Date.UTC(y, m + 1, 1) - KIN_MS;
  return { start, end, open: now >= start && now < end, next: now < start ? start : startOf(y, m + 1) };
}
export function walletInfo(deposits, makuta, now = Date.now(), retraits = []) {
  const win = withdrawWindow(now), done = retraits.some(r => r.le >= win.start && r.le < win.end);
  const ok = win.open && !done;
  return {
    simulation: !REAL_MONEY, taux: USD_TO_MAKUTA, frais: WITHDRAW_FEE, fenetreJours: WITHDRAW_WINDOW_DAYS, dejaRetireCeMois: done,
    deposeUsd: deposits.reduce((s, d) => s + d.usd, 0),
    retraitPossibleLe: ok ? win.start : win.open ? win.next : win.start, retraitPossible: ok,
    valeurUsd: Math.floor(makuta / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100,
  };
}

// vue envoyée au joueur : catalogue, inventaire, portefeuille (même forme côté serveur et mode démo)
export function shopView(inv, dep, ret, makuta, now, gui = []) {
  return {
    boutique: SHOP,
    inventaire: inv.map(x => ({ id: x.id, objet: x.objet_id, porte: !!x.porte, le: x.acquis_le })),
    portefeuille: { ...walletInfo(dep, makuta, now, ret), offres: OFFERS, depots: dep, retraits: ret,
      moyens: PAY_METHODS, guichet: gui, depot: DEPOSIT_USD },
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
  { id: "aide-soignant", nom: "Aide-soignant au centre de santé", talent: "soin", salaire: 160, minAge: 18, etudesMin: "secondaire" },
  { id: "musicien", nom: "Musicien dans un orchestre", talent: "art", salaire: 130, minAge: 16 },
  { id: "mecanicien", nom: "Mécanicien au garage", talent: "technique", salaire: 170, minAge: 18, etudesMin: "primaire" },
  { id: "animateur", nom: "Animateur à la radio", talent: "parole", salaire: 150, minAge: 18, etudesMin: "secondaire" },
  { id: "repetiteur", nom: "Répétiteur (cours du soir)", talent: "etudes", salaire: 140, minAge: 16, etudesMin: "secondaire" },
  // carrières qui demandent des études (ouvertes avec l'école et l'université)
  { id: "medecin", nom: "Médecin", talent: "soin", salaire: 600, minAge: 24, formation: "medecine", diplome: "Doctorat en médecine" },
  { id: "ingenieur", nom: "Ingénieur", talent: "technique", salaire: 500, minAge: 22, formation: "ingenieur", diplome: "Diplôme d'ingénieur civil" },
  { id: "avocat", nom: "Avocat", talent: "parole", salaire: 550, minAge: 22, formation: "droit", diplome: "Licence en droit" },
  { id: "enseignant", nom: "Enseignant au secondaire", talent: "etudes", salaire: 260, minAge: 18, formation: "secondaire", diplome: "Diplôme d'État" },
  // carrières de talent : réservées à ceux dont le talent a été découvert par leurs parents
  { id: "footballeur", nom: "Footballeur professionnel", talent: "sport", salaire: 420, minAge: 17, talentRequis: true },
  { id: "star-rumba", nom: "Chanteur de rumba (vedette)", talent: "art", salaire: 450, minAge: 18, talentRequis: true },
  { id: "chef", nom: "Grand chef cuisinier", talent: "cuisine", salaire: 340, minAge: 18, talentRequis: true },
  { id: "grossiste", nom: "Commerçant grossiste", talent: "commerce", salaire: 380, minAge: 20, talentRequis: true },
  { id: "journaliste", nom: "Journaliste vedette à la télé", talent: "parole", salaire: 380, minAge: 20, talentRequis: true },
  { id: "inventeur", nom: "Inventeur (atelier d'innovation)", talent: "technique", salaire: 400, minAge: 20, talentRequis: true },
  { id: "chercheur", nom: "Chercheur à l'université", talent: "etudes", salaire: 420, minAge: 22, talentRequis: true },
  { id: "infirmier-chef", nom: "Infirmier chef", talent: "soin", salaire: 360, minAge: 20, talentRequis: true },
];
export function cannotApply(job, age, diplomas, talents = []) {
  if (!job) return "Métier inconnu.";
  if (job.talentRequis && !talents.includes(job.talent)) return `Carrière réservée aux talents découverts : ${(TALENTS.find(t => t.id === job.talent) || {}).label || job.talent}.`;
  if (job.elu) return "Ce poste s'obtient par élection.";
  if (job.formation && !diplomas.includes(job.formation)) return `Il faut d'abord le diplôme : ${job.diplome}.`;
  if (job.etudesMin && eduRank(eduLevel(diplomas)) < eduRank(job.etudesMin)) return `Niveau d'études demandé : ${eduLabel(job.etudesMin)}.`;
  if (age < job.minAge) return `Ce métier est ouvert dès ${job.minAge} ans.`;
  return null;
}
export function payFor(job, talents, diplomas = []) {
  const t = talents.find(x => x.talent === job.talent && x.discovered), e = EDU_LEVELS[eduRank(eduLevel(diplomas))];
  return { montant: Math.round(job.salaire * (t ? 1 + TALENT_BONUS : 1) * (1 + e.bonus)), bonus: !!t, etudes: e.bonus };
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
// ---------------------------------------------------------------- réputation et mariage
// La réputation (−100 à +100) : le quartier se souvient de ce que fait le personnage.
export const REP = { crimeAttrape: -15, crimeRumeur: -5, prison: -20, travail: 1, mariage: 10, divorce: -5, negligence: -5 };
export const REP_BAD = -30, REP_GOOD = 40;
export function repLabel(r) { return r >= REP_GOOD ? "respecté" : r >= 10 ? "bien vu" : r > REP_BAD ? "inconnu" : r > -60 ? "mal vu" : "réputé voleur"; }
export const repDiscount = r => r >= REP_GOOD ? 0.8 : 1;   // les gens respectés ont des prix au maquis
// Mariage entre deux joueurs adultes : la dot est payée par la famille du marié (ses parents joueurs s'ils le peuvent, sinon lui-même)
// et versée aux parents de la mariée (sinon à la mariée).
export const DOT_MAKUTA = 1200;   // 60 e-makuta
export const MARRY_MIN_AGE = 18;
export function cannotMarry(a, b, ageA, ageB) {
  if (!b) return "Joueur introuvable (vérifie son pseudo).";
  if (a.id === b.id) return "Tu ne peux pas t'épouser toi-même.";
  if (b.mort_le) return "Ce personnage est mort.";
  if (ageA < MARRY_MIN_AGE || ageB < MARRY_MIN_AGE) return `Le mariage est possible à partir de ${MARRY_MIN_AGE} ans.`;
  if (a.conjoint_id || b.conjoint_id) return "L'un de vous est déjà marié.";
  if (a.sexe === b.sexe) return "La dot se verse entre la famille du marié et celle de la mariée : il faut un homme et une femme.";
  if (a.pere_id && (a.pere_id === b.pere_id || a.mere_id === b.mere_id)) return "Vous êtes de la même famille.";
  return null;
}
// ---------------------------------------------------------------- vague 4 : petits boulots, logement, annonces
// Petits boulots de rue : sans patron ni diplôme, payés tout de suite. Personne n'est bloqué sans revenu.
export const STREET_JOBS = [
  { id: "cireur", nom: "Cireur de chaussures", icone: "👞", gain: [30, 70], minAge: 10, energie: 15 },
  { id: "eau", nom: "Vendeur d'eau en sachet", icone: "💧", gain: [40, 80], minAge: 10, energie: 20 },
  { id: "porteur", nom: "Porteur au marché", icone: "📦", gain: [60, 110], minAge: 14, energie: 30 },
  { id: "lavage", nom: "Laveur de voitures", icone: "🚿", gain: [50, 100], minAge: 14, energie: 25 },
];
export const STREET_COOLDOWN_H = 3;   // un petit boulot toutes les 3 heures réelles
export function cannotStreetJob(j, age, energy, last, now = Date.now()) {
  if (!j) return "Petit boulot inconnu.";
  if (age < j.minAge) return `Possible dès ${j.minAge} ans.`;
  if (energy < j.energie) return "Trop fatigué : repose-toi d'abord.";
  if (last && now - last < STREET_COOLDOWN_H * 36e5) return `Prochain petit boulot dans ${Math.ceil((last + STREET_COOLDOWN_H * 36e5 - now) / 6e4)} min.`;
  return null;
}
// Logement : à partir de 18 ans on loue (loyer prélevé chaque semaine réelle) ou on achète sa parcelle.
// Un loyer impayé = expulsion (retour chez les parents) et réputation en baisse.
// RENT (loyer par commune) est défini plus bas, avec COMMUNES
export const HOUSE_WEEKS = 40;          // une parcelle coûte 40 semaines de loyer
export const HOUSING_MIN_AGE = 18;
export const rentOf = q => RENT[q] || 350;
export const houseOf = q => rentOf(q) * HOUSE_WEEKS;
export function rentDue(paidUntil, now = Date.now()) {
  if (!paidUntil || now < paidUntil) return 0;
  return 1 + Math.floor((now - paidUntil) / (7 * DAY));   // semaines dues
}
// Marché aux annonces : les joueurs se vendent leurs objets ; 5 % de taxe sur la vente pour la ville.
export const SALE_TAX = 0.05;
// ---------------------------------------------------------------- vague 5 : le destin
// Une fois par jour réel, le destin peut frapper : maladie, pluie, cadeau... (montants en makuta)
export const LIFE_EVENTS = [
  { id: "paludisme", icone: "🦟", texte: "a attrapé le paludisme : il faut se soigner au centre de santé", sante: -35, energie: -30, p: .16 },
  { id: "inondation", icone: "🌧️", texte: "la pluie a inondé la maison, il a fallu réparer", bonheur: -10, makuta: [-150, -50], p: .12 },
  { id: "coupure", icone: "🔌", texte: "coupure de courant toute la soirée dans le quartier", bonheur: -5, p: .14 },
  { id: "accident", icone: "🛵", texte: "petit accident de moto-taxi, quelques bleus", sante: -20, p: .06 },
  { id: "oncle", icone: "🎁", texte: "un oncle de Mbandaka a envoyé un cadeau", makuta: [100, 400], bonheur: 8, p: .08 },
  { id: "fete", icone: "🎉", texte: "grande fête dans le quartier, tout le monde a dansé", bonheur: 12, p: .12 },
  { id: "dette", icone: "🤝", texte: "un ami a remboursé une vieille dette", makuta: [60, 200], p: .06 },
  { id: "vol", icone: "👜", texte: "s'est fait voler son argent dans la rue", makuta: [-200, -60], bonheur: -6, p: .05 },
  { id: "entraide", icone: "🫶", texte: "a aidé un voisin dans le besoin, le quartier en parle en bien", bonheur: 8, rep: 3, p: .08, camp: "bon" },
  { id: "arnaque", icone: "🃏", texte: "a arnaqué un passant au marché, sa réputation en prend un coup", makuta: [80, 250], rep: -4, p: .08, camp: "mauvais" },
];
export const EVENT_EVERY_H = 20;
export function drawEvent(r = Math.random, ctx = {}) {
  if (!(SET.destin > 0)) return null;
  const Q = communeOf(ctx.quartier), mult = (Q && Q.risques) || {};
  // le quartier change QUELS événements arrivent, pas leur fréquence totale
  const list = LIFE_EVENTS.filter(e => !e.camp || e.camp === ctx.camp);
  const base = list.reduce((t, e) => t + e.p, 0), w = list.map(e => e.p * (mult[e.id] || 1)), k = base / w.reduce((t, v) => t + v, 0);
  let x = r() / SET.destin;
  for (let i = 0; i < list.length; i++) { const pe = w[i] * k; if (x < pe) return list[i]; x -= pe; }
  return null;   // journée calme
}
export function eventMoney(e, r = Math.random) { return e.makuta ? Math.round(e.makuta[0] + r() * (e.makuta[1] - e.makuta[0])) : 0; }
// Album de vie : le résumé d'une vie, montré à la mort et partageable
export function lifeAlbum(a) {
  const L = [];
  L.push(`${a.prenom} ${a.nom}, ${a.age} an${a.age > 1 ? "s" : ""}, ${a.quartier && a.quartier !== "Kinshasa" ? "de " + a.quartier + ", " : "de "}Kinshasa.`);
  if (a.metier) L.push(`Métier : ${a.metier}.`);
  if (a.diplomes) L.push(`${a.diplomes} diplôme${a.diplomes > 1 ? "s" : ""} obtenu${a.diplomes > 1 ? "s" : ""}.`);
  if (a.talents && a.talents.length) L.push(`Talents découverts : ${a.talents.join(", ")}.`);
  L.push(a.conjoint ? `Marié${a.sexe === "F" ? "e" : ""} à ${a.conjoint}.` : "Jamais marié" + (a.sexe === "F" ? "e" : "") + ".");
  L.push(a.enfants ? `${a.enfants} enfant${a.enfants > 1 ? "s" : ""}.` : "Pas d'enfant.");
  if (a.entreprises) L.push(`${a.entreprises} entreprise${a.entreprises > 1 ? "s" : ""} fondée${a.entreprises > 1 ? "s" : ""}.`);
  if (a.crimes) L.push(`${a.crimes} infraction${a.crimes > 1 ? "s" : ""} à la police.`);
  L.push(`Réputation : ${repLabel(a.reputation || 0)}. Fortune laissée : ${fmtMakuta(a.fortune || 0)}.`);
  L.push(`Cause de la mort : ${a.cause}.`);
  return L;
}
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
export function deathCause(needs, neglectDays = 0, vieux = false) {
  if (needs.health > 0) return null;
  if (vieux) return "vieillesse";
  if (neglectDays >= NEGLECT_DANGER_DAYS) return "négligé par sa famille";
  return needs.hunger < 15 ? "mort de faim" : "maladie non soignée";
}
export function neglectStealChance(unpaidDays, hunger) {
  if (unpaidDays < 1) return 0;
  return Math.min(0.9, (0.12 * unpaidDays + (hunger < 30 ? 0.15 : 0)) * SET.vol);
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
// KINSHASA_QUARTIERS est défini plus bas, avec COMMUNES
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
export function catchChance(crime, policiers) { return Math.min(0.95, (crime.risque + POLICE_BONUS * (policiers || 0)) * SET.police); }
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
    "/api/travailler": () => r.paie && r.paie.arriere ? ["⏳", `Journée de travail : salaire de ${fmtMakuta(r.paie.arriere)} dû par l'État (caisse vide)`] : ["🛠️", `Journée de travail${pay ? " : +" + pay : ""}`],
    "/api/promouvoir": () => ["📣", "Promotion lancée pour son entreprise"],
    "/api/train": () => ["🧺", "Nouveau train de vie : " + (body.niveau === "auto" ? "automatique (selon ses moyens)" : nm(LIFESTYLES, body.niveau))],
    "/api/campagne": () => ["📣", `Campagne publicitaire avec ${r.ambassadeur || "un ambassadeur"} (${fmtMakuta(r.cout || 0)})`],
    "/api/club/recruter": () => ["⚽", `A recruté ${r.recrue || "un joueur"} pour son club`],
    "/api/objectif": () => body.action === "abandonner" ? null : ["🎯", "Nouvel objectif de vie : " + nm(GOALS, body.id)],
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
    "/api/mariage/demander": () => ["💍", "Demande en mariage envoyée à " + (body.pseudo || "un joueur")],
    "/api/mariage/repondre": () => body.accepte ? ["💒", "A dit oui : mariage célébré"] : ["🙅", "A refusé une demande en mariage"],
    "/api/divorce": () => ["💔", "A demandé le divorce"],
    "/api/petitboulot": () => ["🧹", r.boulot ? `Petit boulot (${r.boulot.nom}) : +${fmtMakuta(r.boulot.gain)}` : "Petit boulot"],
    "/api/logement/louer": () => ["🏠", "A loué un logement à " + body.quartier],
    "/api/logement/acheter": () => ["🏡", "A acheté sa parcelle à " + body.quartier],
    "/api/logement/quitter": () => ["🧳", "A quitté son logement"],
    "/api/annonce/publier": () => ["🏷️", "A mis un objet en vente pour " + fmtMakuta(Number(body.prix) || 0)],
    "/api/annonce/retirer": () => ["🏷️", "A retiré une annonce"],
    "/api/annonce/acheter": () => ["🤝", "A acheté à un joueur : " + (r.achete || "un objet")],
  };
  const f = D[path]; if (!f) return null;
  const o = f(); if (!o) return null;
  const [icone, texte] = o; return { icone, texte };
}

// ---------------------------------------------------------------- réglages en direct (page admin)
// Des multiplicateurs : 1 = valeur normale. L'admin les change sans redéployer le jeu.
export const SETTINGS = [
  { id: "prix", label: "Prix (boutique, maquis)", aide: "Tous les prix d'achat.", min: 0.5, max: 3 },
  { id: "salaires", label: "Salaires", aide: "Paie d'une journée de travail.", min: 0.5, max: 3 },
  { id: "faim", label: "Vitesse de la faim", aide: "Plus haut = le personnage a faim plus vite.", min: 0.25, max: 3 },
  { id: "vol", label: "Risque de vol", aide: "Chance qu'un enfant négligé vole.", min: 0, max: 3 },
  { id: "police", label: "Efficacité de la police", aide: "Chance d'être attrapé après un délit.", min: 0.25, max: 3 },
  { id: "destin", label: "Fréquence des événements", aide: "Paludisme, pluie, cadeaux… 0 = aucun.", min: 0, max: 3 },
];
export const SET = Object.fromEntries(SETTINGS.map(s => [s.id, 1]));
const BASE = { shop: SHOP.map(x => x.prix) };
export function applySettings(o = {}) {
  for (const s of SETTINGS) { const v = Number(o[s.id]); SET[s.id] = Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : 1; }
  SHOP.forEach((x, i) => { x.prix = Math.max(1, Math.round(BASE.shop[i] * SET.prix)); });
  JOBS.forEach(j => { if (j.base == null) j.base = j.salaire; j.salaire = Math.max(1, Math.round(j.base * SET.salaires)); });   // base gardée sur chaque métier (des métiers sont ajoutés plus bas)
  return { ...SET };
}
export const FOOD_BASE = { prix: 25, faim: 45 };
export const food = () => ({ prix: Math.max(1, Math.round(FOOD_BASE.prix * SET.prix)), faim: FOOD_BASE.faim });

// ---------------------------------------------------------------- arrivée, classes sociales, études, maturité
// Le joueur ne choisit plus : le jeu décide s'il naît bébé ou s'il arrive jeune adulte.
export const ADULT_ENTRY_CHANCE = 0.45;
export const SOCIAL_CLASSES = [
  { id: "pauvre", label: "Pauvre", p: .35, epargne: [0, 400], seuil: 0 },
  { id: "modeste", label: "Modeste", p: .33, epargne: [400, 1500], seuil: 1400 },
  { id: "moyenne", label: "Classe moyenne", p: .22, epargne: [1500, 5000], seuil: 2500 },
  { id: "aisee", label: "Aisée", p: .08, epargne: [5000, 15000], seuil: 6000 },
  { id: "riche", label: "Riche", p: .02, epargne: [15000, 50000], seuil: 16000 },
];
export const classLabel = id => (SOCIAL_CLASSES.find(c => c.id === id) || SOCIAL_CLASSES[0]).label;
// la classe d'aujourd'hui suit la fortune totale (makuta) : on peut monter ou descendre
export function classOfWealth(total) { let c = SOCIAL_CLASSES[0]; for (const x of SOCIAL_CLASSES) if (total >= x.seuil) c = x; return c.id; }
export function drawClass(r = Math.random) { let x = r(); for (const c of SOCIAL_CLASSES) { if (x < c.p) return c.id; x -= c.p; } return "pauvre"; }
// niveaux d'études : déduits des diplômes, ils ouvrent des métiers et augmentent la paie
export const EDU_LEVELS = [
  { id: "aucun", label: "Sans diplôme", bonus: 0 },
  { id: "primaire", label: "Primaire", bonus: .05 },
  { id: "secondaire", label: "Secondaire (Diplôme d'État)", bonus: .10 },
  { id: "superieur", label: "Supérieur (graduat, licence)", bonus: .20 },
  { id: "doctorat", label: "Doctorat ou ingénieur", bonus: .30 },
];
export const eduRank = id => Math.max(0, EDU_LEVELS.findIndex(e => e.id === id));
export const eduLabel = id => EDU_LEVELS[eduRank(id)].label;
export function eduLevel(diplomas = []) {
  if (diplomas.includes("medecine") || diplomas.includes("ingenieur")) return "doctorat";
  if (diplomas.includes("droit") || diplomas.includes("commerce")) return "superieur";
  if (diplomas.includes("secondaire")) return "secondaire";
  if (diplomas.includes("primaire")) return "primaire";
  return "aucun";
}
// arrivée décidée par le jeu : bébé, ou jeune adulte (18 à 28 ans) avec des études qui dépendent de sa classe
export function drawEntry(r = Math.random) {
  const classe = drawClass(r), adulte = r() < ADULT_ENTRY_CHANCE;
  if (!adulte) return { adulte: false, age: 0, classe, diplomes: [], epargne: 0 };
  const C = SOCIAL_CLASSES.find(c => c.id === classe), k = SOCIAL_CLASSES.indexOf(C), x = r();
  const diplomes = [];
  if (k >= 1 || x < .7) diplomes.push("primaire");
  if (diplomes.length && (k >= 2 || x < .25 * (k + 1))) diplomes.push("secondaire");
  if (diplomes.includes("secondaire") && (k >= 3 || x < .08 * (k + 1))) diplomes.push(["commerce", "droit"][Math.floor(r() * 2)]);
  return { adulte: true, age: 18 + Math.floor(r() * 11), classe, diplomes, epargne: Math.round(C.epargne[0] + r() * (C.epargne[1] - C.epargne[0])) };
}
// maturité : un adulte qui vient d'arriver doit d'abord grandir avant les grandes décisions
export const MATURE_AT = 100, MATURITY_PER_DAY = 10;
export const MATURITY_GAIN = { travail: 8, cours: 10, petitboulot: 4 };
export const BIG_DECISIONS = ["/api/mariage/demander", "/api/logement/acheter", "/api/entreprise/ouvrir", "/api/entreprise/acheter", "/api/candidature"];
export function maturityOf(o, now = Date.now()) {
  if (!o || !o.adulte) return MATURE_AT;
  return Math.min(MATURE_AT, Math.round((o.maturite || 0) + (now - o.arrive_le) / DAY * MATURITY_PER_DAY));
}
export function cannotDecide(o, prenom, now = Date.now()) {
  const m = maturityOf(o, now);
  return m >= MATURE_AT ? null : `${prenom} vient d'arriver dans la vie adulte et doit d'abord grandir avant les grandes décisions (maturité ${m}/${MATURE_AT}). Le temps, le travail et les études font mûrir.`;
}
// tableau de bord : richesse, flux d'argent, part du propriétaire réel
export function dashboard({ makuta, banque = 0, biens = 0, entreprises = 0, maison = 0, flux = {}, depots = [], origine = null, diplomas = [], now = Date.now(), quartier = null, seed = 1 }) {
  const total = makuta + banque + biens + entreprises + maison;
  const naissances = depots.filter(d => d.offre === "bebe").length, depose = depots.reduce((s, d) => s + d.usd, 0);
  return {
    richesse: { poche: makuta, banque, biens, entreprises, maison, total },
    argent: { recu: flux.recu || 0, depense: flux.depense || 0, famille: flux.famille || 0, impots: flux.impots || 0, recuFamille: flux.recuFamille || 0 },
    proprietaire: { deposeUsd: depose, fraisAdminUsd: naissances * ADMIN_FEE_USD, confieUsd: depose - naissances * ADMIN_FEE_USD,
      valeurUsd: Math.floor(total / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100, simulation: !REAL_MONEY },
    classe: { naissance: origine ? origine.classe : null, naissanceLabel: origine ? classLabel(origine.classe) : null, actuelle: classOfWealth(total), actuelleLabel: classLabel(classOfWealth(total)) },
    etudes: { niveau: eduLevel(diplomas), label: eduLabel(eduLevel(diplomas)), bonus: EDU_LEVELS[eduRank(eduLevel(diplomas))].bonus },
    maturite: { points: maturityOf(origine, now), max: MATURE_AT, arriveAdulte: !!(origine && origine.adulte) },
    role: roleOf(origine, seed),
    quartier: communeView(quartier),
  };
}

// ---------------------------------------------------------------- guichet : dépôt et retrait d'argent
// SIMULATION tant que REAL_MONEY est faux : rien n'est encaissé ni versé. Plus tard, un partenaire de paiement agréé
// (Banque Centrale du Congo, vérification d'identité) fera le vrai transfert. Noms en texte seulement, sans logo.
export const PAY_METHODS = [
  { id: "mpesa", nom: "M-Pesa", type: "mobile", icone: "📱" },
  { id: "orange", nom: "Orange Money", type: "mobile", icone: "📱" },
  { id: "airtel", nom: "Airtel Money", type: "mobile", icone: "📱" },
  { id: "carte", nom: "Carte bancaire", type: "carte", icone: "💳" },
  { id: "agent", nom: "Espèces chez un agent", type: "especes", icone: "💵", depotSeulement: true },
];
export const DEPOSIT_USD = { min: 1 };   // pas de plafond (décision du propriétaire, 25/11)
// on ne garde jamais le numéro complet : seulement les 3 derniers chiffres pour l'historique
export function maskPhone(s) { const d = String(s || "").replace(/\D/g, ""); return d.length >= 9 && d.length <= 12 ? "•••• " + d.slice(-3) : null; }
export const withdrawUsd = mk => Math.floor(mk / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100;
export function cannotDeposit(moyen, usd, phone) {
  const m = PAY_METHODS.find(x => x.id === moyen);
  if (!m) return "Choisis un moyen de paiement.";
  if (!Number.isFinite(usd) || usd < DEPOSIT_USD.min) return `Dépôt minimum : ${DEPOSIT_USD.min} $.`;
  if (m.type === "mobile" && !maskPhone(phone)) return "Numéro de téléphone invalide (9 à 12 chiffres).";
  return null;
}
export function cannotWithdraw(w, makuta, mk, moyen, phone) {
  const m = PAY_METHODS.find(x => x.id === moyen);
  if (!w.retraitPossible) return w.dejaRetireCeMois ? `Tu as déjà retiré ton dû ce mois-ci. Prochain retrait à partir du ${new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR", { timeZone: "Africa/Kinshasa" })}.`
    : `Le retrait se fait en fin de mois : à partir du ${new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR", { timeZone: "Africa/Kinshasa" })}.`;
  if (!m || m.depotSeulement) return "Choisis où recevoir l'argent.";
  if (!(mk >= USD_UNITS)) return `Minimum ${USD_TO_MAKUTA} e-makuta (1 $).`;
  if (mk > makuta) return "Tu n'as pas assez d'e-makuta en poche.";
  if (m.type === "mobile" && !maskPhone(phone)) return "Numéro de téléphone invalide (9 à 12 chiffres).";
  return null;
}

// ---------------------------------------------------------------- les communes de Kinshasa (ville et province)
// Chaque environnement a ses bons et ses mauvais côtés. « risques » multiplie la chance des événements du destin.
export const COMMUNES = [
  { nom: "Gombe", zone: "Centre-ville", loyer: 900, bon: ["Quartier d'affaires, banques et ministères", "Rues sûres, beaucoup de policiers", "Courant et eau presque tout le temps"], mauvais: ["Tout est cher", "Embouteillages chaque jour"], risques: { vol: .5, coupure: .4, inondation: .5, paludisme: .7 } },
  { nom: "Lingwala", zone: "Centre", loyer: 400, bon: ["Proche du centre-ville", "Radio, télé et culture"], mauvais: ["Quartier bruyant", "Ruelles serrées"], risques: { vol: 1.1, coupure: 1 } },
  { nom: "Kinshasa", zone: "Centre", loyer: 400, bon: ["À côté du Grand Marché : beaucoup de commerce"], mauvais: ["Foule et pickpockets", "Embouteillages"], risques: { vol: 1.4, fete: 1.1 } },
  { nom: "Barumbu", zone: "Centre", loyer: 350, bon: ["Vieux quartier plein d'histoire", "Proche du fleuve et du port"], mauvais: ["Maisons serrées", "Inondations à la saison des pluies"], risques: { inondation: 1.4, vol: 1.2 } },
  { nom: "Kintambo", zone: "Ouest", loyer: 400, bon: ["Grand marché de Kintambo Magasin", "Bien desservi par les bus"], mauvais: ["Bruit et circulation"], risques: { vol: 1.1 } },
  { nom: "Ngaliema", zone: "Ouest", loyer: 700, bon: ["Quartiers résidentiels calmes", "Vue sur le fleuve, collines vertes"], mauvais: ["Loin du centre pour les petits budgets", "Érosions sur certaines pentes"], risques: { vol: .7, inondation: .8, fete: .8 } },
  { nom: "Bandalungwa", zone: "Cité", loyer: 350, bon: ["« Bandal » : ambiance et musique", "Bonne entente entre voisins"], mauvais: ["Soirées bruyantes", "Coupures de courant"], risques: { fete: 1.4, coupure: 1.2 } },
  { nom: "Kasa-Vubu", zone: "Cité", loyer: 350, bon: ["Commerces et marchés proches", "Animé de jour comme de nuit"], mauvais: ["Embouteillages", "Petits vols"], risques: { vol: 1.2, fete: 1.2 } },
  { nom: "Kalamu", zone: "Cité", loyer: 350, bon: ["Stade Tata Raphaël, sport et loisirs", "Ambiance de quartier"], mauvais: ["La rivière Kalamu déborde parfois"], risques: { inondation: 1.4, fete: 1.2 } },
  { nom: "Matonge", zone: "Cité (Kalamu)", loyer: 300, bon: ["Cœur de la rumba et des nuits de Kinshasa", "Maquis et terrasses partout"], mauvais: ["Bruit la nuit", "Pickpockets dans la foule"], risques: { fete: 1.6, vol: 1.4 } },
  { nom: "Ngiri-Ngiri", zone: "Cité", loyer: 300, bon: ["Quartier populaire et solidaire", "Loyers abordables"], mauvais: ["Ruelles inondées quand il pleut"], risques: { inondation: 1.3 } },
  { nom: "Makala", zone: "Cité", loyer: 250, bon: ["Loyers bas", "Petits commerces partout"], mauvais: ["Quartier très peuplé", "Insécurité la nuit"], risques: { vol: 1.4, paludisme: 1.1 } },
  { nom: "Bumbu", zone: "Cité", loyer: 220, bon: ["Loyers très bas"], mauvais: ["Inondations fréquentes", "Routes en mauvais état"], risques: { inondation: 1.6, paludisme: 1.2 } },
  { nom: "Selembao", zone: "Cité", loyer: 220, bon: ["Collines et grand air", "Loyers bas"], mauvais: ["Érosions dangereuses", "Peu de transport"], risques: { inondation: 1.5, vol: 1.2 } },
  { nom: "Ngaba", zone: "Est", loyer: 280, bon: ["Proche de l'université (UNIKIN)", "Beaucoup d'étudiants"], mauvais: ["Rond-point Ngaba toujours bouché"], risques: { vol: 1.1 } },
  { nom: "Lemba", zone: "Est", loyer: 300, bon: ["Université et écoles : on étudie bien ici", "Quartier vivant"], mauvais: ["Coupures d'eau et de courant"], risques: { coupure: 1.3 } },
  { nom: "Limete", zone: "Est", loyer: 500, bon: ["Zone industrielle : beaucoup d'emplois", "Grand boulevard Lumumba"], mauvais: ["Pollution des usines", "Circulation lourde"], risques: { accident: 1.4, vol: .9 } },
  { nom: "Matete", zone: "Est", loyer: 280, bon: ["Grand marché de Matete", "Ambiance populaire"], mauvais: ["Inondations", "Petits vols au marché"], risques: { inondation: 1.3, vol: 1.2 } },
  { nom: "Kisenso", zone: "Est", loyer: 200, bon: ["Loyers parmi les plus bas", "Vie de quartier simple"], mauvais: ["Érosions et routes coupées", "Loin de tout"], risques: { inondation: 1.6, paludisme: 1.2 } },
  { nom: "Masina", zone: "Est", loyer: 250, bon: ["Très animé, marché de la Liberté", "Proche de l'aéroport de Ndjili"], mauvais: ["Inondations", "Quartier surpeuplé"], risques: { inondation: 1.4, vol: 1.2, fete: 1.1 } },
  { nom: "Ndjili", zone: "Est", loyer: 260, bon: ["Aéroport international tout près", "Quartiers bien tracés"], mauvais: ["Bruit des avions", "Coupures de courant"], risques: { coupure: 1.3 } },
  { nom: "Kimbanseke", zone: "Est", loyer: 200, bon: ["Commune la plus peuplée : beaucoup de clients", "Terrains pas chers"], mauvais: ["Peu de routes goudronnées", "Insécurité la nuit"], risques: { vol: 1.4, paludisme: 1.2, inondation: 1.2 } },
  { nom: "Mont-Ngafula", zone: "Province (sud)", loyer: 450, bon: ["Collines vertes et air frais", "Grandes parcelles"], mauvais: ["Loin du centre", "Érosions"], risques: { vol: .8, inondation: 1.2, paludisme: 1.1 } },
  { nom: "Nsele", zone: "Province (est)", loyer: 220, bon: ["Champs et élevage : on peut cultiver", "Calme et nature, bord du fleuve"], mauvais: ["Très loin du centre", "Moustiques et paludisme"], risques: { paludisme: 1.5, vol: .6, coupure: 1.3 } },
  { nom: "Maluku", zone: "Province (rurale)", loyer: 150, bon: ["Plus grande commune : nature, fleuve et pêche", "Vie très bon marché"], mauvais: ["Presque pas de transport", "Peu d'hôpitaux et beaucoup de paludisme"], risques: { paludisme: 1.6, vol: .5, coupure: 1.5, fete: .7 } },
];
export const RENT = Object.fromEntries(COMMUNES.map(c => [c.nom, c.loyer]));
export const KINSHASA_QUARTIERS = COMMUNES.map(c => c.nom);
export const communeOf = q => COMMUNES.find(c => c.nom === q) || null;
export function communeView(q) {
  const c = communeOf(q); if (!c) return null;
  return { nom: c.nom, zone: c.zone, loyer: c.loyer, bon: c.bon, mauvais: c.mauvais };
}

// ---------------------------------------------------------------- caractère et rôle (donnés par le serveur à l'inscription)
export const CARACTERES = [
  { id: "honnete", nom: "Honnête", camp: "bon" }, { id: "travailleur", nom: "Travailleur", camp: "bon" }, { id: "genereux", nom: "Généreux", camp: "bon" },
  { id: "courageux", nom: "Courageux", camp: "bon" }, { id: "patient", nom: "Patient", camp: "bon" }, { id: "loyal", nom: "Loyal", camp: "bon" },
  { id: "menteur", nom: "Menteur", camp: "mauvais" }, { id: "paresseux", nom: "Paresseux", camp: "mauvais" }, { id: "avare", nom: "Avare", camp: "mauvais" },
  { id: "colerique", nom: "Colérique", camp: "mauvais" }, { id: "jaloux", nom: "Jaloux", camp: "mauvais" }, { id: "ruse", nom: "Rusé et malhonnête", camp: "mauvais" },
];
export const ROLES = [
  { id: "voisin", nom: "Bon voisin", camp: "bon", desc: "Aide les gens de son quartier. Sa réputation monte avec le temps.", rep: 10 },
  { id: "entrepreneur", nom: "Entrepreneur honnête", camp: "bon", desc: "Veut créer des emplois et faire grandir le quartier.", rep: 5 },
  { id: "protecteur", nom: "Protecteur du quartier", camp: "bon", desc: "Défend les plus faibles et respecte la loi.", rep: 10 },
  { id: "educateur", nom: "Éducateur", camp: "bon", desc: "Aime apprendre et transmettre aux plus jeunes.", rep: 5 },
  { id: "soignant", nom: "Soignant de cœur", camp: "bon", desc: "S'occupe des malades et des anciens.", rep: 5 },
  { id: "escroc", nom: "Petit escroc", camp: "mauvais", desc: "Cherche l'argent facile en trompant les autres.", rep: -10 },
  { id: "pickpocket", nom: "Voleur à la tire", camp: "mauvais", desc: "Profite de la foule des marchés. La police le surveille.", rep: -10 },
  { id: "trafiquant", nom: "Trafiquant", camp: "mauvais", desc: "Fait des affaires louches dans l'ombre.", rep: -5 },
  { id: "bagarreur", nom: "Fauteur de troubles", camp: "mauvais", desc: "Se dispute facilement et cherche la bagarre.", rep: -5 },
  { id: "usurier", nom: "Usurier", camp: "mauvais", desc: "Prête de l'argent à des taux injustes.", rep: -5 },
];
export const GOOD_ROLE_CHANCE = 0.7;
export function drawRole(r = Math.random) {
  const camp = r() < GOOD_ROLE_CHANCE ? "bon" : "mauvais", pick = a => a[Math.floor(r() * a.length)];
  return { camp, caractere: pick(CARACTERES.filter(c => c.camp === camp)).id, role: pick(ROLES.filter(x => x.camp === camp)).id };
}
// un personnage né avant cette règle reçoit quand même un rôle, toujours le même (tiré de son apparence)
export function roleOf(o, seed) {
  const d = o && o.role ? { camp: o.camp, caractere: o.caractere, role: o.role } : drawRole(rng((seed || 1) ^ 0x5bd1e995));
  const c = CARACTERES.find(x => x.id === d.caractere) || CARACTERES[0], R = ROLES.find(x => x.id === d.role) || ROLES[0];
  return { camp: d.camp, caractere: c.id, caractereNom: c.nom, role: R.id, roleNom: R.nom, roleDesc: R.desc };
}

// ---------------------------------------------------------------- fidélité : série de jours, résumé de la nuit, réveil du matin
// Une journée compte dans la série quand le joueur donne au moins une consigne (heure de Kinshasa).
export const STREAK_BONUS = [{ jours: 3, makuta: 2 * 20 }, { jours: 7, makuta: 10 * 20 }, { jours: 14, makuta: 15 * 20 }, { jours: 30, makuta: 50 * 20 }];
export const STREAK_EVERY = 7, STREAK_EVERY_MAKUTA = 10 * 20;   // après 30 jours : +10 e-makuta chaque semaine
export function streakBonusFor(n) {
  const b = STREAK_BONUS.find(x => x.jours === n); if (b) return b.makuta;
  return n > 30 && n % STREAK_EVERY === 0 ? STREAK_EVERY_MAKUTA : 0;
}
export const prevDayKey = jour => new Date(Date.parse(jour + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
export const kinHour = (now = Date.now()) => new Date(now + 36e5).getUTCHours();
// une consigne donnée aujourd'hui : la série continue (hier) ou recommence à 1
export function streakStep(f, jour) {
  f = f || {};
  if (f.dernier_jour === jour) return { serie: f.serie || 0, meilleure: f.meilleure || 0, dernier_jour: jour, bonus: 0, nouveau: false };
  const serie = f.dernier_jour === prevDayKey(jour) ? (f.serie || 0) + 1 : 1;
  return { serie, meilleure: Math.max(f.meilleure || 0, serie), dernier_jour: jour, bonus: streakBonusFor(serie), nouveau: true };
}
export function streakView(f, now = Date.now()) {
  f = f || {};
  const jour = dayKey(now), fait = f.dernier_jour === jour, vivante = fait || f.dernier_jour === prevDayKey(jour);
  const serie = vivante ? (f.serie || 0) : 0;
  let n = serie + 1; while (!streakBonusFor(n)) n++;
  return { serie, meilleure: f.meilleure || 0, aujourdhui: fait, enDanger: !fait && serie > 0, perdue: !vivante && (f.serie || 0) > 1 ? f.serie : 0,
    prochainBonus: { jours: n, dans: n - serie, makuta: streakBonusFor(n) }, paliers: STREAK_BONUS };
}
// ce qui s'est passé depuis la dernière visite du joueur (au plus 36 h en arrière)
export const SUMMARY_MAX_MS = 36 * 36e5;
export function nightSummary({ prenom, fem = false, mouvements = [], vuLe = null, makutaVu = null, makuta = 0, besoins = {}, now = Date.now() }) {
  const depuis = Math.max(vuLe || 0, now - SUMMARY_MAX_MS);
  const M = mouvements.filter(m => m.le > depuis).sort((a, b) => b.le - a.le);
  const gain = vuLe && makutaVu != null ? makuta - makutaVu : null;
  const alertes = [];
  if (besoins.hunger !== undefined && besoins.hunger < 30) alertes.push(`🍲 ${prenom} a très faim.`);
  if (besoins.health !== undefined && besoins.health < 40) alertes.push(`🏥 ${prenom} est malade : soigne-le.`);
  if (besoins.energy !== undefined && besoins.energy < 20) alertes.push(`😴 ${prenom} est épuisé${fem ? "e" : ""}.`);
  if (besoins.happiness !== undefined && besoins.happiness < 25) alertes.push(`😟 ${prenom} n'a pas le moral.`);
  return { depuis, premiereVisite: !vuLe, nb: M.length, liste: M.slice(0, 6), gain, alertes,
    nouveau: M.length > 0 || (gain !== null && gain !== 0) };
}
export function morningText(prenom, R, S, fem = false) {
  const bits = [];
  if (R && R.nb) bits.push(`${R.nb} action${R.nb > 1 ? "s" : ""} depuis ta dernière visite`);
  if (R && R.gain) bits.push(`${R.gain > 0 ? "+" : "−"}${fmtMakuta(Math.abs(R.gain))}`);
  return `☀️ ${prenom} s'est réveillé${fem ? "e" : ""}${bits.length ? " (" + bits.join(", ") + ")" : ""}. Donne-lui ses consignes avant 10 h.` + (S && S.serie > 1 ? ` 🔥 Série : ${S.serie} jours.` : "");
}
export function reminderText(prenom, S) {
  return `⏳ Plus qu'une heure pour donner ses consignes à ${prenom} et garder ta série de ${S.serie} jour${S.serie > 1 ? "s" : ""} 🔥.`;
}

// ---------------------------------------------------------------- vie sociale : journal de Kinshasa, voisins, petits mots
const hashStr = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const JOURNAL_START = "2026-11-24";
// faits réels (requêtes du serveur ou de la démo) + la vie de la ville, la même pour tous ce jour-là
export function newspaper(facts = {}, now = Date.now(), quartier = null) {
  const jour = dayKey(now), r = rng(hashStr("journal" + jour)), pick = a => a[Math.floor(r() * a.length)];
  const items = [], add = (icone, poids, titre, texte, commune, le, reel = true) => items.push({ icone, poids, titre, texte, commune: commune || null, le: le || now, reel });
  for (const d of facts.deces || []) add("🕯️", 90, `Deuil à ${d.quartier || "Kinshasa"}`, `${d.prenom} ${d.nom} nous a quittés à ${d.age} ans${d.cause ? " (" + d.cause + ")" : ""}. Ses héritiers se partagent ses biens.`, d.quartier, d.le);
  for (const m of facts.mariages || []) add("💍", 80, "Mariage", `${m.a} et ${m.b} se sont dit oui. La dot a été versée, les deux familles sont en fête.`, m.quartier, m.le);
  for (const e of facts.entreprises || []) add((COMPANY_TYPES.find(t => t.id === e.type) || {}).icone || "🏪", 70, `Nouveau à ${e.quartier || "Kinshasa"} : ${e.nom}`, `${e.proprio} ouvre un${e.type === "boutique" ? "e" : ""} ${((COMPANY_TYPES.find(t => t.id === e.type) || {}).nom || "commerce").toLowerCase()}. Allez y faire un tour !`, e.quartier, e.le);
  for (const n of facts.naissances || []) add("👶", 60, `Bienvenue à ${n.prenom}`, `${n.prenom} ${n.nom} est arrivé${n.sexe === "F" ? "e" : ""} à ${n.quartier || "Kinshasa"}. Nouvelle vie, nouveau destin.`, n.quartier, n.le);
  for (const m of facts.elus || []) add("🗳️", 85, "Résultat des élections", `${m.nom} est élu${m.sexe === "F" ? "e" : ""} ${m.poste} avec ${m.voix} voix.`, null, m.le);
  for (const a of facts.arrestations || []) if (a.n) add("🚔", 40, `Police : ${a.n} arrestation${a.n > 1 ? "s" : ""} à ${a.quartier}`, `Les patrouilles ont été actives à ${a.quartier} ces dernières 24 heures. Restez prudents.`, a.quartier);
  // la vie de la ville
  const C = pick(COMMUNES), C2 = pick(COMMUNES);
  const meteo = pick([["☀️", "Grand soleil sur Kin", "Journée chaude : pensez à boire de l'eau et à manger au maquis."], ["🌧️", "Grosse pluie attendue", `Risque d'inondation à ${C.nom} : les taxis augmentent leurs prix.`], ["⛅", "Temps doux", "Une belle journée pour se promener au bord du fleuve."], ["🌩️", "Orage ce soir", "Rentrez tôt : coupures de courant possibles dans plusieurs communes."]]);
  const vie = [
    { icone: meteo[0], titre: meteo[1], texte: meteo[2] },
    pick([{ icone: "⚽", titre: "Football : derby à Kin", texte: `AS ${C.nom} ${Math.floor(r() * 4)} – ${Math.floor(r() * 4)} FC ${C2.nom === C.nom ? "Lingwala" : C2.nom}. Ambiance de fête dans les deux communes.` },
      { icone: "🎶", titre: "Rumba ce soir", texte: `Concert au maquis de ${C.nom} à partir de 20 h. Entrée libre, sapeurs bienvenus.` },
      { icone: "🧺", titre: "Marché de la Gombe", texte: `Le prix du manioc ${r() < .5 ? "baisse" : "monte"} cette semaine. Les vendeuses parlent d'un ${pick(["bon", "mauvais", "drôle de"])} arrivage.` }]),
    pick([{ icone: "🚌", titre: "Transport", texte: "La ligne 1 du bus circule toute la journée : 2 e-makuta le ticket, et le guide raconte la ville." },
      { icone: "🚧", titre: "Embouteillages", texte: `Gros bouchons vers ${C2.nom} en fin de journée. Prévoyez le bus ou la marche.` },
      { icone: "🏛️", titre: "Hôtel de ville", texte: "La mairie rappelle que les impôts financent les écoles et les hôpitaux de la ville." }]),
  ];
  items.sort((a, b) => b.poids - a.poids || b.le - a.le);
  const reel = items.filter(x => x.reel);
  const une = reel[0] || { ...vie[0], reel: false };
  const ma = quartier ? reel.filter(x => x.commune === quartier) : [];
  const numero = Math.max(1, Math.round((Date.parse(jour) - Date.parse(JOURNAL_START)) / 864e5) + 1);
  const pubs = (facts.pubs || []).slice().sort((a, b) => (b.commune === quartier) - (a.commune === quartier));
  const annonces = pubs.map(a => ({ icone: "📣", titre: `${a.titre} · ${a.annonceur}`, texte: [a.texte, a.commune && `(${a.commune})`].filter(Boolean).join(" "), annonce: true, couleur: a.couleur }));
  return { titre: "Le Journal de Kinshasa", date: jour, numero, une, sponsor: annonces[0] || null,
    rubriques: [
      { id: "commune", titre: quartier ? `Dans ta commune · ${quartier}` : "Dans ta commune", items: ma.slice(0, 12), vide: "Rien de neuf dans ta commune aujourd'hui. Et si ton personnage faisait parler de lui ?" },
      { id: "ville", titre: "Kinshasa", items: reel.slice(0, 20), vide: "La ville se réveille : les premières nouvelles arrivent avec les premiers joueurs." },
      { id: "vie", titre: "La vie à Kin", items: vie, vide: "" },
      { id: "annonces", titre: "Annonces", items: annonces, vide: "Commerçant ? Ton annonce ici : écris au bureau Zboss Sarlu (rubrique Publicité)." },
    ],
    chiffres: facts.chiffres || null };
}
// petits mots entre joueurs : courts, sans lien ni numéro (contre les arnaques), 10 par jour
export const WORD_MAX = 200, WORDS_PER_DAY = 10;
export const GREETINGS = ["👋 Mbote ! On est voisins.", "🍲 On se retrouve au maquis ?", "💼 Tu cherches du travail ? Mon entreprise embauche.", "🙏 Merci pour ton aide !", "⚽ Match ce soir au terrain, tu viens ?"];
export function cannotSendWord(texte, sentToday, toSelf) {
  const t = String(texte || "").trim();
  if (toSelf) return "Tu ne peux pas t'écrire à toi-même.";
  if (!t) return "Écris quelques mots.";
  if (t.length > WORD_MAX) return `${WORD_MAX} caractères au plus.`;
  if (/https?:\/\/|www\.|\.(com|net|org|cd|io)\b/i.test(t)) return "Les liens ne sont pas autorisés dans les mots.";
  if (/(\+?\d[\s.-]?){8,}/.test(t)) return "Pas de numéro de téléphone : pour ta sécurité, garde tes échanges dans le jeu.";
  if (sentToday >= WORDS_PER_DAY) return `Tu as déjà envoyé ${WORDS_PER_DAY} mots aujourd'hui. Reviens demain.`;
  return null;
}
export function neighborView(n, now = Date.now()) {
  const age = ageYears(n.ne_le, now);
  return { id: n.id, prenom: n.prenom, nom: n.nom, sexe: n.sexe, pseudo: n.pseudo || null, quartier: n.quartier, age: Math.floor(age), etape: stageOf(age).label,
    metier: n.metier ? (JOBS.find(j => j.id === n.metier) || {}).nom || n.metier : null, reputation: repLabel(n.reputation || 0), memeCommune: !!n.memeCommune };
}

// ---------------------------------------------------------------- annonces payantes des commerçants partenaires
// Comme dans la vraie vie : le commerçant paie (hors jeu pour l'instant), l'administrateur publie l'annonce.
// Nom réel d'un commerce seulement avec un accord écrit signé (case obligatoire).
export const AD_SPOTS = [
  { id: "journal", nom: "Journal de Kinshasa", prixJourUsd: 2, prixMoisUsd: 50 },
  { id: "panneau", nom: "Panneaux LED de la ville 3D", prixJourUsd: 3, prixMoisUsd: 75 },
  { id: "bandeau", nom: "Bandeau défilant en bas de l'écran", prixJourUsd: 1, prixMoisUsd: 25 },
  { id: "tous", nom: "Journal + panneaux LED + bandeau", prixJourUsd: 5, prixMoisUsd: 95 },
];
// onglet des logos à côté de « EN DIRECT » : vendu à part. Avec « tous », cela fait le Pack Partenaire (6 $/jour, 120 $/mois),
// les mêmes tarifs que la lettre de proposition envoyée aux entreprises.
export const LOGO_SPOT = { id: "logo", nom: "Onglet des logos (à côté de « EN DIRECT »)", prixJourUsd: 1, prixMoisUsd: 25 };
// où chaque emplacement est montré
export const AD_SHOWN = { journal: ["journal", "tous"], panneau: ["panneau", "tous"], bandeau: ["bandeau", "tous"] };
export const adShownIn = (a, support) => (AD_SHOWN[support] || []).includes(a.emplacement);
// prix : chaque bloc de 30 jours au tarif mensuel (moins cher), les jours restants au tarif du jour, jamais plus que le mois suivant
const spotPrice = (s, jours) => { const j = Math.max(1, Math.round(jours || 1)), mois = Math.floor(j / 30); return mois * s.prixMoisUsd + Math.min((j % 30) * s.prixJourUsd, s.prixMoisUsd); };
export function adPrice(emplacement, jours) { const s = AD_SPOTS.find(x => x.id === emplacement); return s ? spotPrice(s, jours) : 0; }
export const logoPrice = jours => spotPrice(LOGO_SPOT, jours);
export const AD_COLORS = ["#ffd23f", "#18e0ff", "#ff5a1f", "#7dff8a", "#ff2bd6", "#3fa9ff"];
export function cannotCreateAd(a = {}) {
  const t = k => String(a[k] ?? "").trim();
  if (t("annonceur").length < 2 || t("annonceur").length > 40) return "Nom du commerçant : 2 à 40 caractères.";
  if (t("titre").length < 2 || t("titre").length > 24) return "Titre (panneau) : 2 à 24 caractères.";
  if (t("texte").length > 90) return "Texte : 90 caractères au plus.";
  if (!AD_SPOTS.some(s => s.id === a.emplacement)) return "Choisis un emplacement.";
  const j = Number(a.jours); if (!Number.isInteger(j) || j < 1 || j > 365) return "Durée : 1 à 365 jours.";
  if (t("commune") && !COMMUNES.some(c => c.nom === t("commune"))) return "Commune inconnue.";
  if (!a.accord) return "Coche « Accord écrit signé » : pas de nom de commerce réel sans contrat.";
  return null;
}
export const adActive = (a, now = Date.now()) => !!a.actif && a.debut <= now && a.fin > now;
export function adView(a) { return { id: a.id, annonceur: a.annonceur, titre: a.titre, texte: a.texte || "", commune: a.commune || null, emplacement: a.emplacement, couleur: a.couleur || AD_COLORS[0], fin: a.fin }; }

// ---------------------------------------------------------------- sociétés publiques
// Entreprises de l'État (noms inventés, inspirés des secteurs publics du Congo). Elles encaissent des recettes,
// embauchent des personnages et paient leurs agents ; au-delà de leur réserve, le surplus va au Trésor.
export const PUBLIC_COMPANIES = [
  { id: "sp-mwinda", nom: "Mwinda, électricité publique", icone: "💡", tutelle: "Ministère de l'Énergie", recette: "Factures d'électricité des logements (1 e-makuta par jour)" },
  { id: "sp-mai", nom: "Mai ya Kin, eau potable", icone: "🚰", tutelle: "Ministère des Ressources hydrauliques", recette: "Factures d'eau des logements (0,5 e-makuta par jour)" },
  { id: "sp-regie", nom: "Régie publicitaire de Kinshasa", icone: "📣", tutelle: "Ministère de la Communication", recette: "Promotions achetées par les entreprises du jeu" },
  { id: "sp-voirie", nom: "Office de la voirie et de la propreté", icone: "🚧", tutelle: "Ministère des Infrastructures", recette: "Budget de l'État (routes, propreté des marchés)" },
];
export const BILLS = { "sp-mwinda": 20, "sp-mai": 10 };    // makuta par jour et par logement
export const SOE_RESERVE = 100000;                          // 5 000 e-makuta gardés en caisse, le reste va au Trésor
export const STATE_SEED = 400000;                           // budget de départ de l'État (20 000 e-makuta, une seule fois)
export const VAT = 0.16;                                    // TVA (DGI), comprise dans les prix des magasins et des maquis
export const vatOf = prix => Math.round(prix * VAT / (1 + VAT));
const SOE_JOBS = [
  { id: "electricien", nom: "Électricien (Mwinda)", talent: "technique", salaire: 210, minAge: 18, societe: "sp-mwinda" },
  { id: "agent-eau", nom: "Agent d'eau potable (Mai ya Kin)", talent: "technique", salaire: 190, minAge: 18, societe: "sp-mai" },
  { id: "commercial-regie", nom: "Commercial de la Régie publicitaire", talent: "parole", salaire: 230, minAge: 20, societe: "sp-regie" },
  { id: "cantonnier", nom: "Cantonnier (Office de la voirie)", talent: "sport", salaire: 160, minAge: 18, societe: "sp-voirie" },
];
PUBLIC_JOBS.push(...SOE_JOBS); JOBS.push(...SOE_JOBS);
// qui paie un agent public : sa société publique (si elle a l'argent), sinon le Trésor ; sinon le salaire est dû (arriéré)
export function publicPayer(job, soldes = {}) {
  const amount = job.salaire, soe = job.societe;
  if (soe && (soldes[soe] || 0) >= amount) return { payeur: soe, ok: true };
  if ((soldes[STATE_ID] || 0) >= amount) return { payeur: STATE_ID, ok: true, subvention: !!soe };
  return { payeur: soe || STATE_ID, ok: false };
}
export function billsFor(makuta) {           // factures du jour : on paie ce qu'on peut, l'électricité d'abord
  let left = makuta; const out = [];
  for (const [id, m] of Object.entries(BILLS)) { const paid = Math.max(0, Math.min(left, m)); left -= paid; out.push({ societe: id, du: m, paye: paid }); }
  return out;
}
export function soeView(soldes = {}, agents = {}) {
  return PUBLIC_COMPANIES.map(c => ({ ...c, solde: soldes[c.id] || 0, agents: agents[c.id] || 0, metiers: SOE_JOBS.filter(j => j.societe === c.id) }));
}

// ---------------------------------------------------------------- promotion des entreprises du jeu (payée en e-makuta)
export const PROMO_PRICE = { bandeau: 400, journal: 600, panneau: 800, tous: 1400 };   // makuta par jour
export const PROMO_MAX_DAYS = 7;
export function promoPrice(emplacement, jours) { return (PROMO_PRICE[emplacement] || 0) * Math.max(1, Math.round(jours || 1)); }
export function cannotPromote(a = {}, makuta = 0, owns = false, active = false) {
  if (!owns) return "Seul le propriétaire peut promouvoir son entreprise.";
  if (active) return "Cette entreprise a déjà une promotion en cours.";
  const t = k => String(a[k] ?? "").trim();
  if (t("titre").length < 2 || t("titre").length > 24) return "Titre : 2 à 24 caractères.";
  if (t("texte").length > 90) return "Texte : 90 caractères au plus.";
  if (/https?:|www\.|\d{8,}/i.test(t("titre") + " " + t("texte"))) return "Pas de lien ni de numéro de téléphone dans une promotion.";
  if (!PROMO_PRICE[a.emplacement]) return "Choisis où passer la promotion.";
  const j = Number(a.jours); if (!Number.isInteger(j) || j < 1 || j > PROMO_MAX_DAYS) return `Durée : 1 à ${PROMO_MAX_DAYS} jours.`;
  if (makuta < promoPrice(a.emplacement, j)) return `Il faut ${fmtMakuta(promoPrice(a.emplacement, j))} pour cette promotion.`;
  return null;
}

// ---------------------------------------------------------------- bandeau défilant (bas de l'écran)
export function tickerItems({ pubs = [], tresor = 0, impotsJour = 0, salairesJour = 0, arrieres = 0, elec = null, une = null, communiques = [], campagnes = [], matchs = [] } = {}, now = Date.now()) {
  const out = [];
  pubs.forEach(a => out.push({ type: "pub", icone: "📣", texte: `${a.titre} · ${a.annonceur}${a.texte ? " : " + a.texte : ""}`, couleur: a.couleur }));
  campagnes.forEach(c => out.push({ type: "pub", icone: "🌟", texte: `${c.entreprise} : ${c.ambassadeur} ${c.fem ? "est la nouvelle ambassadrice" : "est le nouvel ambassadeur"}${c.slogan ? " · « " + c.slogan + " »" : ""}`, couleur: "#7dff8a" }));
  if (matchs.length) out.push({ type: "sport", icone: "⚽", texte: `${LEAGUE_NAME} : ` + matchs.slice(0, 6).map(m => `${m.dom_nom} ${m.buts_dom}-${m.buts_ext} ${m.ext_nom}`).join(" · ") });
  communiques.forEach(c => out.push({ type: "communique", icone: "📢", texte: `${c.auteur} : ${c.texte}` }));
  out.push({ type: "etat", icone: "🏛️", texte: `Trésor public : ${fmtMakuta(tresor)} · impôts et taxes du jour : ${fmtMakuta(impotsJour)} · salaires publics payés : ${fmtMakuta(salairesJour)}` });
  if (arrieres > 0) out.push({ type: "etat", icone: "⚠️", texte: `${arrieres} agent${arrieres > 1 ? "s" : ""} de l'État attend${arrieres > 1 ? "ent" : ""} leur salaire : le Trésor manque d'impôts.` });
  out.push({ type: "etat", icone: "🧾", texte: `Décision de l'État : TVA de 16 % comprise dans les prix, 5 % d'IPR sur les salaires, 10 % sur les recettes des entreprises. Ces impôts paient les agents publics.` });
  if (elec && elec.prochaine) {
    const d = Math.ceil((elec.prochaine - now) / 864e5);
    out.push({ type: "etat", icone: "🗳️", texte: elec.voteOuvert ? "Le vote est ouvert : chaque habitant de 18 ans et plus choisit ses élus." : `Prochaine élection dans ${d} jour${d > 1 ? "s" : ""}. Les candidatures sont ouvertes.` });
  }
  if (une) out.push({ type: "journal", icone: une.icone || "📰", texte: `À la une : ${une.titre}. ${une.texte || ""}`.trim() });
  return out.slice(0, 30);
}
export const COMMUNIQUE_MAX = 140;
export function cannotCreateCommunique(c = {}) {
  const t = k => String(c[k] ?? "").trim();
  if (t("auteur").length < 2 || t("auteur").length > 40) return "Auteur : 2 à 40 caractères.";
  if (t("texte").length < 5 || t("texte").length > COMMUNIQUE_MAX) return `Texte : 5 à ${COMMUNIQUE_MAX} caractères.`;
  const j = Number(c.jours); if (!Number.isInteger(j) || j < 1 || j > 60) return "Durée : 1 à 60 jours.";
  const inst = INSTITUTIONS.some(i => i.nom === t("auteur")) || PUBLIC_COMPANIES.some(i => i.nom === t("auteur")) || t("auteur") === "Mairie de Kinshasa";
  if (!inst && !c.accord) return "Un partenaire réel (banque, opérateur, brasserie…) n'apparaît qu'avec un accord écrit signé : coche la case.";
  return null;
}

// ---------------------------------------------------------------- objectifs de vie
export const GOALS = [
  { id: "entrepreneur", nom: "Fonder une entreprise", icone: "🏪", prog: f => Math.min(1, f.entreprises) },
  { id: "proprietaire", nom: "Acheter sa maison", icone: "🏠", prog: f => (f.proprio ? 1 : 0) },
  { id: "mariage", nom: "Se marier", icone: "💍", prog: f => (f.marie ? 1 : 0) },
  { id: "parent", nom: "Avoir un enfant", icone: "👶", prog: f => Math.min(1, f.enfants) },
  { id: "fortune", nom: "Réunir 5 000 e-makuta", icone: "💰", prog: f => Math.min(1, f.fortune / 100000) },
  { id: "diplome", nom: "Obtenir un diplôme", icone: "🎓", prog: f => Math.min(1, f.diplomes) },
  { id: "talents", nom: "Découvrir 3 talents", icone: "✨", prog: f => Math.min(1, f.talents / 3) },
  { id: "service", nom: "Servir l'État (emploi public)", icone: "🏛️", prog: f => (f.public ? 1 : 0) },
  { id: "elu", nom: "Être élu par les habitants", icone: "🗳️", prog: f => (f.elu ? 1 : 0) },
  { id: "star", nom: "Devenir une star (réputation 60)", icone: "⭐", prog: f => Math.max(0, Math.min(1, f.rep / 60)) },
];
export const GOALS_MAX = 3, GOAL_REP = 15;
export function goalsView(rows = [], f = {}) {
  const mine = rows.map(r => { const g = GOALS.find(x => x.id === r.objectif_id); if (!g) return null; const pr = g.prog(f); return { id: g.id, nom: g.nom, icone: g.icone, progres: Math.round(pr * 100), atteint: r.atteint_le || null, choisi: r.choisi_le }; }).filter(Boolean);
  return { mes: mine, catalogue: GOALS.map(g => ({ id: g.id, nom: g.nom, icone: g.icone, choisi: mine.some(m => m.id === g.id) })), max: GOALS_MAX, recompense: GOAL_REP };
}
export function newlyReached(rows = [], f = {}) { return rows.filter(r => !r.atteint_le && (GOALS.find(g => g.id === r.objectif_id) || { prog: () => 0 }).prog(f) >= 1).map(r => r.objectif_id); }
export function cannotChooseGoal(id, rows = []) {
  if (!GOALS.some(g => g.id === id)) return "Objectif inconnu.";
  if (rows.some(r => r.objectif_id === id)) return "Cet objectif est déjà choisi.";
  if (rows.filter(r => !r.atteint_le).length >= GOALS_MAX) return `${GOALS_MAX} objectifs en cours au plus : abandonne-en un d'abord.`;
  return null;
}

// ---------------------------------------------------------------- les stars de la ville (choisies par le serveur chaque jour)
export const STAR_DOMAINS = [
  { id: "sport", nom: "Sport", icone: "⚽", talent: "sport", titres: [["Footballeur", "Footballeuse"], ["Basketteur", "Basketteuse"], ["Boxeur", "Boxeuse"]] },
  { id: "musique", nom: "Musique", icone: "🎤", talent: "art", titres: [["Chanteur de rumba", "Chanteuse de rumba"], ["Guitariste", "Guitariste"], ["Danseur", "Danseuse"]] },
  { id: "affaires", nom: "Affaires", icone: "💼", titres: [["Entrepreneur", "Entrepreneuse"], ["Commerçant", "Commerçante"], ["Patron", "Patronne"]] },
  { id: "politique", nom: "Politique", icone: "🏛️", titres: [["Homme politique", "Femme politique"], ["Candidat", "Candidate"]] },
  { id: "cuisine", nom: "Cuisine", icone: "🍲", talent: "cuisine", titres: [["Chef de maquis", "Cheffe de maquis"], ["Cuisinier", "Cuisinière"]] },
];
const STAR_NEWS = {
  sport: ["a gagné son dernier match devant tout le quartier", "s'entraîne chaque matin au terrain de la Gombe", "a signé avec un nouveau club du jeu", "a offert des ballons aux enfants du quartier"],
  musique: ["a rempli la salle de concert hier soir", "prépare un nouvel album de rumba", "a chanté au mariage d'un habitant", "tourne un clip au bord du fleuve"],
  affaires: ["ouvre une nouvelle boutique", "a embauché trois habitants cette semaine", "investit dans les transports", "a payé ses impôts en avance"],
  politique: ["a visité le marché pour écouter les commerçants", "défend une loi sur les salaires publics", "a inauguré une route réparée par la voirie", "fait campagne dans sa commune"],
  cuisine: ["sert le meilleur liboke de la ville", "a gagné le concours de cuisine du quartier", "ouvre son maquis jusqu'à minuit", "apprend la cuisine aux jeunes"],
};
// choisit une star par domaine parmi les meilleurs candidats ; le choix change chaque jour
export function pickStars(cands = {}, now = Date.now(), seedNames = null) {
  const day = dayKey(now), used = new Set();
  return STAR_DOMAINS.map(d => {
    const list = (cands[d.id] || []).slice(0, 3);
    const h = hashStr(day + d.id);
    let s = list.length ? list[h % list.length] : null;
    if (!s && seedNames) { let n = seedNames(h, d.id), k = 1; while (used.has(n.prenom) && k < 6) n = seedNames(h + k++ * 7919, d.id); used.add(n.prenom); s = { id: "pnj-" + d.id + "-" + day, prenom: n.prenom, nom: n.nom, sexe: n.sexe, quartier: n.quartier, age: 22 + h % 20, pnj: true }; }
    if (!s) return null;
    const news = STAR_NEWS[d.id], titre = d.titres[(h >>> 3) % d.titres.length][s.sexe === "F" ? 1 : 0];
    return { ...s, domaine: d.id, domaineNom: d.nom, icone: d.icone, titre: s.titre || titre,
      actualites: s.actualites && s.actualites.length ? s.actualites : [0, 1, 2].map(i => ({ icone: d.icone, texte: `${s.prenom} ${news[(h + i * 7) % news.length]}.` })) };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- train de vie : les dépenses du quotidien (v46)
// Chaque jour (heure de Kinshasa), un personnage adulte dépense pour vivre, selon ses moyens. Le loyer et les factures
// d'eau et d'électricité sont prélevés à part (logement, sociétés publiques). L'argent va aux entreprises des joueurs
// (TVA de 16 % au Trésor) : les entreprises qui font de la publicité attirent plus de clients.
export const BUDGET_POSTS = [
  { id: "nourriture", icone: "🍚", label: "Nourriture à la maison", vers: ["supermarche", "boutique", "maquis"] },
  { id: "habits", icone: "👕", label: "Habits, coiffure et entretien", vers: ["boutique", "salon"] },
  { id: "transport", icone: "🚕", label: "Déplacements (taxi, bus, moto)", vers: ["taxi"] },
  { id: "sante", icone: "💊", label: "Santé, hygiène et savon", vers: ["pharmacie"] },
  { id: "telephone", icone: "📱", label: "Crédit téléphone et internet", vers: [] },
  { id: "formation", icone: "📚", label: "Livres, journaux et formation", vers: ["ecole"] },
  { id: "loisirs", icone: "🎉", label: "Sorties, fêtes et loisirs", vers: ["maquis", "hotel", "club"] },
  { id: "entraide", icone: "🤝", label: "Likelemba, église et entraide", vers: [] },
];
// montants en makuta par jour réel ; effets appliqués une fois par jour
export const LIFESTYLES = [
  { id: "survie", nom: "Survie", icone: "🥣", desc: "Un repas simple par jour, rien d'autre.", postes: { nourriture: 20 },
    effet: { faim: 35, sante: -2, bonheur: -4 }, tenue: 10, vitalite: 20 },
  { id: "modeste", nom: "Modeste", icone: "🍲", desc: "Deux repas, savon, un peu de transport et de crédit.", postes: { nourriture: 40, habits: 10, transport: 15, sante: 5, telephone: 5, entraide: 5 },
    effet: { faim: 55, sante: 1, bonheur: 0 }, tenue: 45, vitalite: 50 },
  { id: "confort", nom: "Confort", icone: "🏡", desc: "Bien manger, de beaux habits, taxi, soins et sorties.", postes: { nourriture: 70, habits: 30, transport: 30, sante: 15, telephone: 10, formation: 10, loisirs: 20, entraide: 10 },
    effet: { faim: 70, sante: 2, bonheur: 4 }, tenue: 75, vitalite: 75 },
  { id: "aise", nom: "Aisé", icone: "💎", desc: "Le meilleur : tenue soignée, médecin privé, voyages et fêtes.", postes: { nourriture: 120, habits: 80, transport: 60, sante: 30, telephone: 20, formation: 20, loisirs: 60, entraide: 20 },
    effet: { faim: 85, sante: 3, bonheur: 8 }, tenue: 95, vitalite: 95 },
];
export const LIFESTYLE_MIN_AGE = 18;          // avant 18 ans, l'entretien payé par les parents couvre tout
export const LIFESTYLE_RESERVE_DAYS = 10;     // en automatique, le personnage garde de quoi tenir 10 jours à ce niveau
export const lifestyleCost = id => { const l = LIFESTYLES.find(x => x.id === id); return l ? Object.values(l.postes).reduce((a, b) => a + b, 0) : 0; };
// le niveau réellement payé aujourd'hui : celui choisi, ou moins si l'argent manque ; "auto" = le personnage décide selon ses moyens
export function lifestyleFor(choice, makuta) {
  const order = LIFESTYLES.map(l => l.id);
  let i = choice && choice !== "auto" ? order.indexOf(choice) : order.length - 1;
  if (i < 0) i = 1;
  const reserve = !choice || choice === "auto" ? LIFESTYLE_RESERVE_DAYS : 1;
  while (i > 0 && lifestyleCost(order[i]) * reserve > makuta) i--;
  const l = LIFESTYLES[i];
  return lifestyleCost(l.id) <= makuta ? l : null;   // null : même la survie est trop chère (pas de repas)
}
// présentation (tenue) et vitalité : se rapprochent chaque jour du niveau de vie
export const TENUE_STEP = 10, VITALITE_STEP = 3;
const toward = (x, t, s) => x < t ? Math.min(t, x + s) : Math.max(t, x - s);
export function lifestyleStep(st = {}, l) {
  const t = st.tenue ?? 40, v = st.vitalite ?? 50;
  return l ? { tenue: toward(t, l.tenue, TENUE_STEP), vitalite: toward(v, l.vitalite, VITALITE_STEP) } : { tenue: toward(t, 0, TENUE_STEP), vitalite: toward(v, 0, VITALITE_STEP) };
}
// espérance de vie : de 55 à 80 ans selon la vitalité (bien manger, se soigner, ne pas manquer)
export const LIFE_BASE = 55, LIFE_RANGE = 25;
export const lifeExpectancy = vitalite => Math.round(LIFE_BASE + LIFE_RANGE * Math.max(0, Math.min(100, vitalite ?? 50)) / 100);
export const OLD_AGE_HEALTH = 8;              // au-delà de son espérance de vie, la santé baisse de 8 points par jour
// présentation : les postes bien payés demandent une tenue correcte
export const TENUE_JOB_MIN = 40, TENUE_JOB_PAY = 250;
export const tenueLabel = t => t >= 80 ? "très soignée" : t >= 55 ? "soignée" : t >= TENUE_JOB_MIN ? "correcte" : t >= 20 ? "négligée" : "en haillons";
export function tenueBlocks(job, tenue) {
  if (!job || tenue == null) return null;
  if ((job.salaire >= TENUE_JOB_PAY || job.formation) && tenue < TENUE_JOB_MIN)
    return `Le recruteur trouve ta tenue ${tenueLabel(tenue)} : il faut une présentation correcte (${TENUE_JOB_MIN}). Passe au train de vie « Modeste » ou mieux quelques jours.`;
  return null;
}
export function livingView(st = {}, makuta = 0, age = 30) {
  const choice = st.niveau || "auto", today = lifestyleFor(choice, makuta);
  return {
    choix: choice, minAge: LIFESTYLE_MIN_AGE, adulte: age >= LIFESTYLE_MIN_AGE,
    niveaux: LIFESTYLES.map(l => ({ id: l.id, nom: l.nom, icone: l.icone, desc: l.desc, cout: lifestyleCost(l.id), postes: l.postes, tenue: l.tenue, vitalite: l.vitalite, effet: l.effet })),
    postes: BUDGET_POSTS.map(p => ({ id: p.id, icone: p.icone, label: p.label })),
    prevu: today ? today.id : null, prevuCout: today ? lifestyleCost(today.id) : 0,
    tenue: st.tenue ?? 40, tenueLabel: tenueLabel(st.tenue ?? 40), vitalite: st.vitalite ?? 50, esperance: lifeExpectancy(st.vitalite ?? 50),
    dernier: st.dernier_jour ? { jour: st.dernier_jour, niveau: st.dernier_niveau, depense: st.depense_jour || 0 } : null,
    reserveJours: LIFESTYLE_RESERVE_DAYS,
  };
}

// ---------------------------------------------------------------- campagnes publicitaires avec un ambassadeur
// Une entreprise de joueur paie un personnage (souvent une star) pour la faire connaître. Tant que la campagne dure,
// les habitants choisissent plus souvent cette entreprise pour leurs dépenses, et le bandeau l'annonce.
export const CAMPAIGN_MAX_DAYS = 14, AMBASSADOR_MIN_AGE = 18, AMBASSADOR_TENUE = 50;
export function ambassadorFee(rep = 0, star = false) { return Math.round((100 + 8 * Math.max(0, rep)) * (star ? 3 : 1)); }   // makuta par jour
export function cannotHireAmbassador({ owns, active, self, age, rep, tenue, star, prix, jours, makuta, slogan } = {}) {
  if (!owns) return "Cette entreprise n'est pas à toi.";
  if (self) return "Tu ne peux pas être ton propre ambassadeur.";
  if (active) return "Cette entreprise a déjà une campagne en cours.";
  const j = Number(jours); if (!Number.isInteger(j) || j < 1 || j > CAMPAIGN_MAX_DAYS) return `Durée : 1 à ${CAMPAIGN_MAX_DAYS} jours.`;
  const s = String(slogan || "").trim(); if (s.length > 60) return "Slogan : 60 caractères au plus.";
  if (/https?:|www\.|\.com|\d{6,}/i.test(s.replace(/\s/g, ""))) return "Pas de lien ni de numéro de téléphone dans le slogan.";
  if (age < AMBASSADOR_MIN_AGE) return `Un ambassadeur doit avoir au moins ${AMBASSADOR_MIN_AGE} ans.`;
  if (rep <= REP_BAD) return "Cette personne a trop mauvaise réputation : elle ferait fuir tes clients.";
  if ((tenue ?? 50) < AMBASSADOR_TENUE) return "Sa tenue est trop négligée pour une publicité : elle refuse de poser comme ça.";
  const fee = ambassadorFee(rep, star);
  if (!Number.isInteger(Number(prix)) || Number(prix) < fee) return `Offre refusée : cette personne demande au moins ${fmtMakuta(fee)} par jour.`;
  if (makuta < Number(prix) * j) return `Il te faut ${fmtMakuta(Number(prix) * j)} pour payer toute la campagne.`;
  return null;
}

// ---------------------------------------------------------------- football : clubs, recrutement, championnat
// Les clubs des joueurs (type d'entreprise « club ») recrutent des personnages et jouent un match par jour contre les
// autres clubs de la ville. Noms des clubs du jeu inventés (aucun vrai club).
COMPANY_TYPES.push({ id: "club", nom: "Club de football", icone: "⚽", prix: 300000, recette: 4000, job: "joueur-club", poste: "Joueur de football", talent: "sport", salaire: 220, places: 18,
  desc: "Recrute des joueurs, joue le championnat de Kinshasa et vend des billets les jours de match." });
export const LEAGUE_NAME = "Championnat de Kinshasa";
export const NPC_CLUBS = [
  { id: "pnj-simba", nom: "Simba ya Kin", force: 62 }, { id: "pnj-ndjili", nom: "Étoile de Ndjili", force: 55 },
  { id: "pnj-kinkole", nom: "Pirogues de Kinkole", force: 50 }, { id: "pnj-lemba", nom: "Lemba Sporting", force: 58 },
  { id: "pnj-matete", nom: "Jeunesse de Matete", force: 52 }, { id: "pnj-kimbanseke", nom: "Kimbanseke United", force: 47 },
  { id: "pnj-ngaliema", nom: "Colline de Ngaliema", force: 60 }, { id: "pnj-bandal", nom: "Bandal Olympique", force: 54 },
];
export const CLUB_MIN_AGE = 16, CLUB_MAX_AGE = 38, CLUB_MIN_PLAYERS = 1, CLUB_CONTRACT_DAYS = 30;
export const MATCH_GATE = { victoire: 2500, nul: 1200, defaite: 600 };   // billetterie (makuta) versée à la caisse du club
// force d'un club de joueurs : effectif et niveau en sport (talent découvert) de ses joueurs
export function clubStrength(players = []) {
  if (!players.length) return 30;
  const lv = players.map(p => p.niveau || 25).sort((a, b) => b - a).slice(0, 11);
  return Math.round(30 + Math.min(11, players.length) * 2.5 + lv.reduce((a, b) => a + b, 0) / lv.length * 0.25);
}
// un match : la force décide en moyenne, la chance fait le reste
export function playMatch(fa, fb, r = Math.random) {
  const goals = f => { const lam = Math.max(0.3, 1.3 * f / 55); let k = 0, p = Math.exp(-lam), s = p, u = r(); while (u > s && k < 7) { k++; p *= lam / k; s += p; } return k; };
  return [goals(fa * 1.05), goals(fb)];   // petit avantage à domicile
}
export function pairClubs(clubs, day = "") {
  const list = clubs.slice().sort((a, b) => hashStr(day + a.id) - hashStr(day + b.id)), out = [];
  if (list.length % 2) { const i = list.map(c => String(c.id).startsWith("pnj-")).lastIndexOf(true); list.splice(i >= 0 ? i : list.length - 1, 1); }   // nombre impair : un club du jeu se repose
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}
export function standings(matches = []) {
  const t = {};
  const row = (id, nom) => (t[id] = t[id] || { id, nom, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, pts: 0 });
  for (const m of matches) {
    const a = row(m.dom_id, m.dom_nom), b = row(m.ext_id, m.ext_nom);
    a.j++; b.j++; a.bp += m.buts_dom; a.bc += m.buts_ext; b.bp += m.buts_ext; b.bc += m.buts_dom;
    if (m.buts_dom > m.buts_ext) { a.g++; b.p++; a.pts += 3; } else if (m.buts_dom < m.buts_ext) { b.g++; a.p++; b.pts += 3; } else { a.n++; b.n++; a.pts++; b.pts++; }
  }
  return Object.values(t).sort((x, y) => y.pts - x.pts || (y.bp - y.bc) - (x.bp - x.bc) || y.bp - x.bp);
}
export function scorersText(names = []) { const c = {}; names.forEach(n => c[n] = (c[n] || 0) + 1); return Object.entries(c).map(([n, k]) => k > 1 ? `${n} (${k})` : n).join(", ") || null; }
export const seasonKey = (now = Date.now()) => dayKey(now).slice(0, 7);   // une saison = un mois
// le joueur accepte-t-il l'offre du club ? (le personnage décide seul, comme un vrai joueur)
export function cannotRecruit({ owns, isClub, self, age, prix, current = 0, places, used, prison } = {}) {
  if (!owns) return "Ce club n'est pas à toi.";
  if (!isClub) return "Seul un club de football peut recruter des joueurs.";
  if (self) return "Tu es le président du club : recrute quelqu'un d'autre.";
  if (used >= places) return "L'effectif est complet.";
  if (prison) return "Ce joueur est en prison.";
  if (age < CLUB_MIN_AGE || age > CLUB_MAX_AGE) return `Un joueur doit avoir entre ${CLUB_MIN_AGE} et ${CLUB_MAX_AGE} ans.`;
  const min = Math.max(150, Math.round(current * 1.1));
  if (!Number.isInteger(Number(prix)) || Number(prix) < min) return `Le joueur refuse : il veut au moins ${fmtMakuta(min)} par journée (10 % de plus que son salaire actuel).`;
  if (Number(prix) > 2000) return "Salaire trop élevé : 100 e-makuta par journée au plus.";
  return null;
}

// ---------------------------------------------------------------- logos des partenaires (onglet défilant du bandeau)
// Un logo est la marque d'un vrai partenaire : il n'apparaît qu'avec un accord écrit signé. Image réduite par la page
// admin (160 × 80 au plus) et gardée en base sous forme de data URL.
export const LOGO_MAX_CHARS = 60000, LOGOS_MAX_SHOWN = 12;
export function cannotAddLogo(l = {}) {
  const nom = String(l.nom ?? "").trim();
  if (nom.length < 2 || nom.length > 40) return "Nom du partenaire : 2 à 40 caractères.";
  const s = String(l.logo || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return "Choisis une image (PNG, JPEG ou WebP).";
  if (s.length > LOGO_MAX_CHARS) return "Image trop lourde : choisis un logo plus simple.";
  const j = Number(l.jours); if (!Number.isInteger(j) || j < 1 || j > 365) return "Durée : 1 à 365 jours.";
  if (!l.accord) return "Le logo d'un partenaire n'apparaît qu'avec un accord écrit signé : coche la case.";
  return null;
}
