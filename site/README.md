# Site Professa-M

| Page | Rôle |
| --- | --- |
| `index.html` | Landing page publique. Le formulaire « Demander une démo » enregistre le prospect dans le CRM (fonction `submit_lead`). |
| `crm.html` | CRM de l'équipe : tableau par étape (glisser-déposer), liste, fiche prospect, historique des échanges, relances, export CSV. |
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
