# Zboss-Entertainment · landing page des courts films chinois

Page statique (HTML + CSS + JavaScript, sans outil de build) : héros avec bande-annonce, catalogue filtrable,
lecteur vidéo par épisodes, offres, inscription gratuite et FAQ. Pensée d'abord pour le téléphone.

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page. Pas besoin de la modifier pour changer le contenu. |
| `config.js` | Nom de la marque, films, adresses des vidéos, offres, nombre d'épisodes gratuits, connexion au CRM. |
| `media/` | Deux vidéos de démonstration (8 s, générées, sans droits) à remplacer par les vraies. |

## Fonctionnement du lecteur

- **Sans inscription** : épisode 1 (réglage `episodesSansCompte`).
- **Après inscription gratuite** : épisodes 1 à 3 (réglage `episodesAvecCompte`).
- Au-delà : écran « Pass » qui renvoie vers les offres (le paiement mobile money viendra avec le CRM).
- Le site retient la progression sur l'appareil (« Reprendre où vous en étiez ») et enchaîne l'épisode suivant après 5 s.

> Ce verrouillage est un **verrou d'interface** : il sert à convertir les visiteurs, pas à protéger les vidéos.
> Pour réserver vraiment les épisodes payants, il faudra des liens signés côté serveur (étape CRM / paiement).

## Bande d'annonces défilante (partenaires)

Sous l'écran principal, une bande fait défiler les annonces de `annonces` dans `config.js` :

```js
annonces: [
  { partenaire: "Nom du partenaire", texte: "Son message", lien: "https://son-site.exemple" }
]
```

Le défilement s'arrête au survol et avec le bouton pause. Le bouton « Votre annonce ici » mène à la section
« Annonceurs et partenaires », dont le bouton ouvre WhatsApp (`whatsapp`) ou l'e-mail `contactPartenaires`.
Liste vide = bande masquée.

## Ajouter vos films

Dans `config.js`, chaque film a un `video` avec `{n}` remplacé par le numéro d'épisode :

```js
video: "https://votre-stockage.exemple/fiancee-jade/ep{n}.mp4"
```

Formats conseillés : MP4 H.264, 720p, sous-titres français incrustés, 2 à 3 minutes par épisode.
Hébergement des vidéos gratuit ou presque : Cloudflare R2 (10 Go gratuits, sans frais de sortie) ou Bunny Stream (quelques centimes par Go).
N'utilisez que des films dont vous détenez les droits de diffusion.

## Inscriptions : où vont-elles ?

Le site choisit automatiquement :

1. **Supabase (CRM)** si `supabaseUrl` et `supabaseKey` sont remplis dans `config.js`. Il appelle la fonction `inscrire_spectateur` ci-dessous.
2. **Netlify Forms** si le site est en ligne sur Netlify (gratuit jusqu'à 100 inscriptions par mois, visibles dans Netlify → Forms).
3. **Mode démonstration** en local : rien n'est envoyé.

Fonction SQL proposée pour le CRM (à créer dans Supabase → SQL Editor quand la table des spectateurs existera) :

```sql
create table if not exists public.spectateurs (
  id          uuid primary key default gen_random_uuid(),
  prenom      text not null check (length(btrim(prenom)) between 2 and 80),
  email       text check (email is null or (length(email) <= 200 and email like '%@%')),
  whatsapp    text check (whatsapp is null or length(whatsapp) <= 40),
  pays        char(2) not null default 'CD',
  genres      text[] not null default '{}',
  source      text not null default 'landing',
  statut      text not null default 'inscrit',
  created_at  timestamptz not null default now(),
  check (email is not null or whatsapp is not null)
);
alter table public.spectateurs enable row level security; -- aucun accès direct depuis le navigateur

create or replace function public.inscrire_spectateur(
  p_prenom text, p_email text, p_whatsapp text, p_pays text, p_genres text[], p_source text default 'landing'
) returns void
language sql security definer set search_path = '' as $$
  insert into public.spectateurs (prenom, email, whatsapp, pays, genres, source)
  values (btrim(p_prenom), lower(nullif(btrim(p_email), '')), nullif(btrim(p_whatsapp), ''),
          coalesce(nullif(p_pays, ''), 'CD'), coalesce(p_genres, '{}'), coalesce(p_source, 'landing'));
$$;
revoke all on function public.inscrire_spectateur(text, text, text, text, text[], text) from public;
grant execute on function public.inscrire_spectateur(text, text, text, text, text[], text) to anon;
```

## Mise en ligne gratuite

- **Netlify (recommandé)** : app.netlify.com → *Add new site* → *Deploy manually* → glissez le dossier `films/`.
  Ou reliez le dépôt avec *Base directory* = `films` et *Publish directory* = `films`.
- **GitHub Pages** : possible aussi, mais Netlify Forms n'y fonctionne pas ; il faut alors remplir la connexion Supabase.

## Tester en local

```bash
cd films && python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
