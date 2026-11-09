# Site Professa-M

| Page | Rôle |
| --- | --- |
| `index.html` | Landing page publique. Le formulaire « Demander une démo » enregistre le prospect dans le CRM (fonction `submit_lead`). |
| `crm.html` | CRM de l'équipe : tableau par étape (glisser-déposer), liste, fiche prospect, historique des échanges, relances, export CSV. |
| `studio.html` | Studio de doublage (équipe) : transcription, traduction et voix dans plusieurs langues, lecture synchronisée, export .srt et .wav. |
| `config.js` | Adresse du projet Supabase, clé publique et numéro WhatsApp (facultatif). |

## Donner accès au CRM

1. Supabase → **Authentication → Users → Add user** : créez votre compte (e-mail + mot de passe, « Auto confirm » coché).
2. Supabase → **SQL Editor** : autorisez cet e-mail (en minuscules) :

   ```sql
   insert into public.crm_admins (email) values ('votre-email@exemple.com');
   ```

3. Ouvrez `crm.html` et connectez-vous.

## Mise en ligne

Le dossier `site/` est statique : Netlify (gratuit) le publie tel quel grâce à `netlify.toml`.

## Activer le doublage (Studio)

La fonction Supabase `dub` est déployée. Elle a besoin de trois clés gratuites, à ajouter dans
Supabase → **Edge Functions → Secrets** (jamais dans le code ni dans une conversation) :

| Secret | Où l'obtenir | Rôle |
| --- | --- | --- |
| `GROQ_API_KEY` | console.groq.com → API Keys | Transcription (Whisper) |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | Traduction |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profil → API Keys | Voix |

Réglages facultatifs : `GEMINI_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `ELEVENLABS_MODEL_LOCAL`.
