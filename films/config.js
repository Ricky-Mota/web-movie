// Réglages de la landing page « Zboss-Entertainment ». Tout ce qui change souvent est ici :
// le nom, les prix, les films et les adresses des vidéos. Le reste du site n'a pas besoin d'être modifié.
window.YING_CONFIG = {
  marque: "Zboss-Entertainment",
  slogan: "Les meilleurs courts films et mini-séries chinoises, sous-titrés en français, anglais, espagnol et portugais.",
  whatsapp: "",               // ex. "243825565647" (sans +). Vide = bouton masqué.

  // Nombre d'épisodes visibles sans inscription, puis après inscription gratuite.
  episodesSansCompte: 1,
  episodesAvecCompte: 3,

  // Où envoyer les inscriptions.
  // 1. Supabase (CRM) : renseignez supabaseUrl + supabaseKey. Le site appelle la fonction SQL
  //    « inscrire_spectateur » (voir LISEZMOI.md). C'est la cible quand le CRM sera prêt.
  // 2. Sinon, sur Netlify, le formulaire passe par Netlify Forms (gratuit, 100 inscriptions/mois).
  // 3. Sinon (fichier ouvert en local), mode démonstration : rien n'est envoyé.
  supabaseUrl: "",
  supabaseKey: "",

  // Offres affichées (exemples à ajuster).
  offres: [
    { nom: "Découverte", prix: "Gratuit", detail: "Les premiers épisodes de chaque film, sans carte bancaire.", points: ["3 épisodes par film", "Sous-titres en 4 langues", "Nouveautés chaque semaine"] },
    { nom: "Pass Semaine", prix: "1 $", periode: "/ semaine", detail: "Tout le catalogue pendant 7 jours.", points: ["Tous les épisodes", "Sans publicité", "Paiement mobile money"], vedette: true },
    { nom: "Pass Mois", prix: "3 $", periode: "/ mois", detail: "Le meilleur prix pour les passionnés.", points: ["Tous les épisodes", "Accès anticipé aux sorties", "Paiement mobile money"] }
  ],
  paiements: ["M-Pesa", "Airtel Money", "Orange Money", "Carte bancaire"],

  // Contact affiché aux annonceurs (si pas de WhatsApp). Ex. "partenaires@exemple.com".
  contactPartenaires: "",

  // Bande d'annonces défilante sous l'écran principal. Exemples à remplacer par vos vraies annonces.
  // « lien » est facultatif : une adresse https://… ou une ancre de la page (#offres).
  annonces: [
    { partenaire: "Nouveauté", texte: "« Le Thé de minuit » arrive ce vendredi : 18 épisodes de comédie.", lien: "#catalogue" },
    { partenaire: "Offre", texte: "Pass Semaine à 1 $ : tout le catalogue pendant 7 jours.", lien: "#offres" },
    { partenaire: "Exemple d'annonceur", texte: "Votre promotion ici, vue par chaque spectateur dès l'ouverture du site." },
    { partenaire: "Bientôt", texte: "Paiement des pass par M-Pesa, Airtel Money et Orange Money." },
    { partenaire: "Annonceurs", texte: "Réservez cette bande pour vos sorties, événements et promotions.", lien: "#partenaires" }
    // Partenaires potentiels : n'activer une ligne (retirer les //) qu'après leur accord écrit
    // sur le texte et l'usage de leur nom. Les textes ci-dessous sont à valider avec chacun.
    // , { partenaire: "Vodacom", texte: "Texte validé par Vodacom", lien: "https://…" }
    // , { partenaire: "Rawbank", texte: "Texte validé par Rawbank", lien: "https://…" }
    // , { partenaire: "Bralima", texte: "Texte validé par Bralima", lien: "https://…" }
    // , { partenaire: "Bracongo", texte: "Texte validé par Bracongo", lien: "https://…" }
    // , { partenaire: "Folucco", texte: "Texte validé par Folucco", lien: "https://…" }
  ],

  // Langues des sous-titres proposées dans le lecteur (bouton CC). La première sert par défaut,
  // sauf si le téléphone du spectateur est réglé sur une autre langue de la liste. Son choix est mémorisé.
  langues: [
    { code: "fr", nom: "Français" },
    { code: "en", nom: "English" },
    { code: "es", nom: "Español" },
    { code: "pt", nom: "Português" }
  ],
  langueParDefaut: "",        // ex. "fr" pour imposer le français au départ ; vide = langue du téléphone si elle est dans la liste.

  // Sous-titres de la bande-annonce. {lang} est remplacé par fr, en, es ou pt. Fichiers .vtt ou .srt.
  sousTitresBandeAnnonce: "media/sous-titres-demo.{lang}.vtt",

  // Vidéo du héros (bande-annonce). Remplacez par l'adresse de votre vraie bande-annonce.
  bandeAnnonce: "media/bande-annonce-demo.mp4",

  // Catalogue. « video » = modèle d'adresse des épisodes : {n} est remplacé par le numéro ({nn} = sur 2 chiffres : 01, 02…).
  // « sousTitres » = modèle d'adresse des sous-titres : {lang}, {n} et {nn} sont remplacés.
  //   ex. "https://votre-stockage.exemple/le-nom-vole/le-nom-vole_ep{nn}.{lang}.srt"
  // Les fichiers de démonstration servent pour tous les épisodes en attendant vos vidéos.
  films: [
    { id: "fiancee-jade", titre: "La Fiancée de jade", hanzi: "玉", genre: "Romance", annee: 2026, episodes: 24, minutes: 2,
      couleurs: ["#7a1022", "#2a0a10"], vedette: true, nouveau: true,
      synopsis: "Promise à un héritier qu'elle n'a jamais vu, Lin Yue s'enfuit le soir de ses noces et trouve refuge chez un simple potier. Elle ignore qu'il est l'homme qu'elle devait épouser.",
      bandeAnnonce: "media/bande-annonce-demo.mp4", video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "retour-general", titre: "Le Retour du général", hanzi: "将", genre: "Historique", annee: 2026, episodes: 30, minutes: 3,
      couleurs: ["#5b3a12", "#1b120a"],
      synopsis: "Cru mort sur le champ de bataille, le général Zhao revient incognito à la capitale pour démasquer ceux qui l'ont trahi.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "heritiere-cachee", titre: "L'Héritière cachée", hanzi: "金", genre: "Drame", annee: 2025, episodes: 40, minutes: 2,
      couleurs: ["#8a6a1c", "#1f1606"],
      synopsis: "Serveuse le jour, Chen Xi découvre qu'elle est la fille perdue de la plus riche famille de Shanghai. Sa demi-sœur n'a pas l'intention de partager.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "the-minuit", titre: "Le Thé de minuit", hanzi: "茶", genre: "Comédie", annee: 2026, episodes: 18, minutes: 2,
      couleurs: ["#1f5a4a", "#0a1a16"], nouveau: true,
      synopsis: "Une maison de thé qui n'ouvre qu'à minuit, une patronne qui lit l'avenir dans les feuilles, et des clients plus bizarres les uns que les autres.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "mille-lanternes", titre: "Les Mille Lanternes", hanzi: "灯", genre: "Fantastique", annee: 2025, episodes: 36, minutes: 3,
      couleurs: ["#9c2a12", "#200806"],
      synopsis: "Chaque lanterne allumée pendant la fête exauce un vœu. Cette année, l'une d'elles réveille un esprit endormi depuis mille ans.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "vengeance-shanghai", titre: "Vengeance à Shanghai", hanzi: "仇", genre: "Thriller", annee: 2026, episodes: 28, minutes: 2,
      couleurs: ["#2a2f45", "#0b0c14"],
      synopsis: "Dix ans après l'incendie qui a ruiné sa famille, Wei revient sous un faux nom et entre au service de l'homme qui l'a allumé.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "patron-immortel", titre: "Mon patron est un immortel", hanzi: "仙", genre: "Fantastique", annee: 2026, episodes: 22, minutes: 2,
      couleurs: ["#3d2a6a", "#100a1c"],
      synopsis: "Stagiaire dans une start-up de Shenzhen, Xiao Mei remarque que son patron ne vieillit pas. Du tout. Depuis 1890.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" },
    { id: "pinceau-imperatrice", titre: "Le Pinceau de l'impératrice", hanzi: "墨", genre: "Historique", annee: 2025, episodes: 32, minutes: 3,
      couleurs: ["#2b2b2b", "#0c0c0c"],
      synopsis: "Calligraphe de la cour, Su Lan glisse des messages secrets dans les édits impériaux. Un seul trait de trop, et c'est la mort.",
      video: "media/episode-demo.mp4", sousTitres: "media/sous-titres-demo.{lang}.vtt" }
  ]
};
