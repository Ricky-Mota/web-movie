# Professa Studio — mise en ligne

Studio de doublage : on importe une vidéo MP4, on coche les langues, le studio transcrit, traduit, crée les voix, puis on écoute et on télécharge la vidéo doublée.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `public/index.html` | La page du studio (écran, boutons, volume jusqu'à 400 %, téléchargements, projets) |
| `netlify/functions/transcribe.js` | Voix → texte (Whisper sur Groq) |
| `netlify/functions/translate.js` | Traduction des phrases (modèle de langue sur Groq) |
| `netlify/functions/tts.js` | Texte → voix MP3 (ElevenLabs, ou Google Cloud Text-to-Speech) |
| `netlify/functions/health.js` | Indique au studio si les clés sont bien configurées |
| `netlify/lib/common.js` | Vérifications communes (mot de passe, clés, quotas) |
| `netlify.toml` | Dit à Netlify où trouver les fonctions |

Tes clés ne sont jamais dans la page : elles restent cachées côté serveur, dans les fonctions.

## Étape 1 — Créer les deux clés gratuites

**Clé Groq** (transcription + traduction)
1. Va sur https://console.groq.com et crée un compte.
2. Menu **API Keys** → **Create API Key** → copie la clé (elle commence par `gsk_`).

**Clé ElevenLabs** (voix — recommandé, sans carte bancaire)
1. Va sur https://elevenlabs.io et crée un compte gratuit.
2. En bas à gauche : ton profil → **API Keys** (ou https://elevenlabs.io/app/settings/api-keys) → **Create API Key**.
3. Donne-lui un nom (`professa`), laisse au minimum la permission **Text to Speech** activée, puis copie la clé (elle commence par `sk_`).
4. Formule gratuite : environ 20 minutes de voix par mois avec le modèle par défaut (`eleven_flash_v2_5`).

**Clé Google** (voix — alternative, carte bancaire obligatoire)
1. Va sur https://console.cloud.google.com et crée un projet (ex. « professa »).
2. Active la facturation sur le projet (obligatoire, mais tu ne paies rien sous le quota gratuit mensuel).
3. Menu **API et services** → **Bibliothèque** → active **Cloud Text-to-Speech API**.
4. **API et services** → **Identifiants** → **Créer des identifiants** → **Clé API** → copie la clé.
5. Conseil : clique sur la clé → **Restreindre la clé** → n'autorise que « Cloud Text-to-Speech API ».

## Étape 2 — Mettre le dossier en ligne sur Netlify

Les fonctions ne marchent pas avec un simple glisser-déposer du dossier dans Netlify. Utilise l'une de ces deux méthodes :

**Méthode A — GitHub (recommandée)**
1. Crée un dépôt sur https://github.com et envoie-y tout le contenu de ce dossier.
2. Sur Netlify : **Add new site** → **Import an existing project** → choisis le dépôt.
3. Laisse les réglages par défaut et clique **Deploy**.

**Méthode B — Netlify CLI (depuis ton ordinateur)**
1. Installe Node.js, puis dans un terminal : `npm install -g netlify-cli`
2. Dans ce dossier : `netlify login`, puis `netlify deploy --prod`

## Étape 3 — Ajouter les clés dans Netlify

Netlify → ton site → **Site configuration** → **Environment variables** → **Add a variable** :

| Nom | Valeur |
|---|---|
| `GROQ_API_KEY` | ta clé Groq (`gsk_…`) |
| `ELEVENLABS_API_KEY` | ta clé ElevenLabs (`sk_…`) — ou `GOOGLE_TTS_API_KEY` avec ta clé Google |
| `STUDIO_PASSWORD` | un mot de passe de ton choix (**fortement conseillé**) |

Sans `STUDIO_PASSWORD`, toute personne qui trouve l'adresse de ton site peut utiliser tes quotas Groq et Google. Avec, le studio demande le mot de passe une fois (il est ensuite mémorisé sur l'appareil).

Puis **Deploys** → **Trigger deploy** → **Deploy site** pour qu'elles soient prises en compte.

Ouvre ensuite `https://ton-site.netlify.app/` : en haut à droite, les deux pastilles doivent être vertes.

## Réglages facultatifs (variables Netlify)

| Nom | Exemple | Effet |
|---|---|---|
| `ELEVENLABS_VOICE_ID` | `onwK4e9ZLuTAKqWW03F9` | Voix ElevenLabs pour toutes les langues (par défaut « Daniel », voix masculine) |
| `ELEVENLABS_VOICES` | `{"fr":"<id>","ar":"<id>"}` | Une voix ElevenLabs différente par langue |
| `GOOGLE_TTS_VOICES` | `{"fr-FR":"fr-FR-Neural2-A","en-US":"en-US-Neural2-D"}` | Choisir des voix plus naturelles par langue |
| `GROQ_TEXT_MODEL` | `llama-3.3-70b-versatile` | Changer le modèle de traduction si Groq le remplace |
| `GROQ_FALLBACK_MODEL` | `llama-3.1-8b-instant` | Modèle léger utilisé automatiquement quand le quota du jour du modèle principal est épuisé (`none` pour désactiver) |
| `GROQ_STT_MODEL` | `whisper-large-v3` | Transcription plus précise (un peu plus lente) |

## Bon à savoir

- **Enregistrer le projet** (étape 5) : sauvegarde transcription, traductions et voix dans un fichier `.professa.json`. Plus tard : recharge la même vidéo, ouvre le projet, et tout revient sans consommer de quota.
- **Corrections** : après modification d'une phrase (bordure orange), « Régénérer la voix » ne recrée que les phrases modifiées.
- **Langue de la vidéo** : l'indiquer à l'étape 1 évite les erreurs de détection sur les vidéos courtes ou bruitées.
- **Quotas** : si Groq ou Google signale un dépassement, le studio attend le délai demandé puis réessaie tout seul.

- **Sources acceptées** : fichiers MP4 (H.264 + AAC) ou lien direct vers un MP4 qui autorise la lecture depuis d'autres sites. Pas de liens YouTube, Facebook ou TikTok.
- **Lingala et kikongo** : traduits et affichés en sous-titres. Google n'a pas de voix pour ces langues.
- **Swahili** : si Google ne propose pas de voix sur ton compte, le studio bascule automatiquement en sous-titres.
- **Téléchargement de la vidéo** : la vidéo se crée en rejouant le film en temps réel. Garde l'onglet visible jusqu'à la fin. Utilise Chrome ou Edge sur ordinateur.
- **Coût** : gratuit tant que tu restes dans les quotas mensuels de Groq et de Google (environ une dizaine de vidéos de 10 minutes en 8 voix par mois). Surveille ta consommation dans les consoles Groq et Google Cloud.
