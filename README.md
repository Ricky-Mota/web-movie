# Professa Studio

Studio de doublage vidéo dans le navigateur : on importe une vidéo MP4, le studio la transcrit (Whisper sur Groq), la traduit dans jusqu'à 10 langues (Llama sur Groq), crée les voix (Google Text-to-Speech), puis exporte la vidéo doublée, la piste audio, les sous-titres et le texte.

- `public/index.html` — le studio (une seule page, sans dépendance)
- `netlify/functions/` — les fonctions serveur qui gardent les clés API secrètes
- `netlify.toml` — configuration Netlify

Mise en ligne pas à pas : voir **[LISEZMOI.md](LISEZMOI.md)**.

## G-Challenge (jeu)

Le dossier `g-challenge-serveur/` contient le serveur du jeu G-Challenge : joueurs, équipes, duels au fantôme, mises Mobile Money et anti-triche. Il est indépendant du studio et n'est pas déployé sur Netlify. Voir **[g-challenge-serveur/README.md](g-challenge-serveur/README.md)**.

Le dossier `g-challenge-landing/` contient la landing page publique de la bêta (site Netlify séparé), dont le formulaire alimente le Google Sheet importé par le CRM. Voir **[g-challenge-landing/README.md](g-challenge-landing/README.md)**.
