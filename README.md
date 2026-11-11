# Professa Studio

Studio de doublage vidéo dans le navigateur : on importe une vidéo MP4, le studio la transcrit (Whisper sur Groq), la traduit dans jusqu'à 10 langues (Llama sur Groq), crée les voix (Google Text-to-Speech), puis exporte la vidéo doublée, la piste audio, les sous-titres et le texte.

- `public/index.html` — le studio (une seule page, sans dépendance)
- `netlify/functions/` — les fonctions serveur qui gardent les clés API secrètes
- `netlify.toml` — configuration Netlify

Mise en ligne pas à pas : voir **[LISEZMOI.md](LISEZMOI.md)**.
