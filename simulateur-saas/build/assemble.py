import sys
src=open('source.html',encoding='utf8').read().split('\n')
course=open('course.js',encoding='utf8').read().rstrip('\n').split('\n')
# lines are 1-indexed: course block = 662..973
assert src[661].startswith('/* ===== Scénarios'), src[661]
assert src[972]=='})();', src[972]
out=src[1:661]+course+src[973:]
h='\n'.join(out)
h=h.replace('</body></html>','')
def R(a,b,n=1):
    global h
    c=h.count(a)
    assert c==n,(a[:60],c)
    h=h.replace(a,b)
R('<title>Simulateur Claude Code</title>','<title>Simulateur SaaS Claude Code</title>')
R('<div class="eyebrow">Université Saint Joseph · Maîtriser Claude Code</div>','<div class="eyebrow">Académie SaaS · Claude Code, Supabase, n8n, WhatsApp</div>')
R('<h1>Simulateur guidé Claude Code</h1>','<h1>Simulateur SaaS — Claude Code</h1>')
R('Claude et Claude Code sont des marques d’Anthropic ; ce simulateur n’est pas une publication officielle d’Anthropic.',
  'Claude et Claude Code sont des marques d’Anthropic ; n8n, Supabase, WhatsApp, Higgsfield, Blender, Unreal Engine et GitHub appartiennent à leurs propriétaires. Ce simulateur de formation n’est publié par aucun d’eux. Vérifiez prix et conditions d’utilisation le jour J.')
R("const MODULES = ['Découvrir','Installer','Dialoguer (COFE)','CLAUDE.md','Sécurité','Git','Skills','MCP','Automatiser','Projet final','Pratiques'];",
  "const MODULES = ['Socle commun','Vendeur WhatsApp','Services WhatsApp','Vidéo et contenu IA','3D temps réel','Dev, MCP et GitHub','Pilotage et formation','Lancer et vendre','Vidéos'];")
R('if (curMod===11){','if (curMod===9){')
R('Épreuve de sécurité (leçon 22)','Épreuve finale (leçon 22)')
R('réussir l’épreuve de sécurité (leçon 22)','réussir l’épreuve finale (leçon 22)')
R('Passer l’épreuve de sécurité','Passer l’épreuve finale')
R("'Épreuve de sécurité (Évaluation)'","'Épreuve finale (Évaluation)'")
R('attestations_simulateur_claude_code.csv','attestations_simulateur_saas.csv')
R('L’attestation officielle est signée par le formateur (modèle de l’annexe 9 du guide).','L’attestation est délivrée et signée par le formateur.')
# POURQUOI
import json
P={
"1":"Un projet bien démarré (dossier dédié, Git, CLAUDE.md, secrets hors du code) évite les fuites de clés et les pertes de travail sur tous vos SaaS.",
"2":"Les 17 SaaS reposent sur le même socle. Savoir quelle brique fait quoi vous fait gagner des semaines et garde vos coûts au plus bas.",
"3":"Vos clients vous confient leurs données. Sans RLS, la clé publique de l’app suffit à tout lire : c’est la faille la plus fréquente des SaaS débutants.",
"4":"Le vendeur WhatsApp est le SaaS le plus rapide à vendre. Ce workflow est la brique que vous réutiliserez pour les rappels, le recouvrement et les résumés.",
"5":"Laisser Claude Code écrire la base est rapide, à condition de planifier, tester sur une base de test et refuser l’accès aux secrets.",
"6":"Un test réel, comme un client, révèle les prix inventés, les commandes perdues et les relances abusives avant qu’un vrai client ne les voie.",
"7":"Les rappels automatiques réduisent les rendez-vous manqués : un résultat facile à mesurer et à vendre aux cliniques, salons et garages.",
"8":"Le KYC manipule des pièces d’identité : un stockage public ou des accès trop larges mettraient en danger les clients de la microfinance.",
"9":"Un recouvrement progressif et poli récupère l’argent sans abîmer la relation client, et les décisions juridiques restent humaines.",
"10":"Une usine à pubs n’est rentable que si chaque vidéo coûte moins que ce qu’elle rapporte, et si le client valide avant diffusion.",
"11":"Un script Blender bien écrit produit des centaines de rendus sans intervention : votre temps n’est plus le facteur limitant.",
"12":"Un community manager automatisé engage la réputation de la marque : brouillons par l’IA, validation par le client.",
"13":"Un configurateur 3D vend mieux qu’une fiche produit, à condition d’être léger sur téléphone et de calculer les prix côté serveur.",
"14":"Choisir la bonne technologie 3D selon le budget du client évite de vendre des serveurs GPU à une petite agence.",
"15":"Un connecteur MCP sur mesure transforme les données d’une entreprise en réponses en langage courant : un service à forte valeur, à livrer en lecture seule d’abord.",
"16":"La revue automatique repère les failles (injection SQL, secrets) avant la fusion : un abonnement simple à vendre aux équipes de développement.",
"17":"Livrer une application interne en jours plutôt qu’en mois : Claude Code écrit, vous facturez la compréhension du métier et la maintenance.",
"18":"Le résumé du lundi réutilise les briques du vendeur WhatsApp : un revenu récurrent supplémentaire pour presque aucun développement.",
"19":"Rater une échéance de licence ou une clause dangereuse coûte cher. Une veille automatique bien cadrée rassure le dirigeant.",
"20":"Ce simulateur est lui-même un SaaS (n° 17) : savoir créer vos scénarios vous permet de vendre des formations sur n’importe quel logiciel.",
"21":"Valider la demande et fixer les bons prix décide si votre SaaS sera rentable, bien plus que la qualité du code.",
"22":"L’épreuve Moyen vérifie les réflexes de sécurité et de vente indispensables avant de lancer un SaaS. Sa réussite en mode Évaluation donne l’attestation Moyen.",
"23":"Sans paiement intégré, la boutique relance chaque client à la main. Encaisser par M-Pesa, Orange Money ou Airtel Money avec pawaPay, directement dans la conversation, transforme une discussion en vente et justifie un abonnement plus élevé.",
"24":"Un rappel de paiement mal protégé permet de marquer une commande « payée » sans payer. Signature pawaPay, reconfirmation du statut, idempotence et contrôle du montant sont le minimum pour toucher à l’argent de vos clients.",
"25":"Chaque nouvelle boutique doit être en service en moins d’une heure, avec un catalogue juste. C’est ce qui vous permet de passer de 3 à 50 clients.",
"26":"Une application qui reste sur votre ordinateur ne se facture pas. La mettre en ligne proprement, sans exposer de clé secrète et avec le domaine du client, c’est livrer.",
"27":"Les branches, les prévisualisations et le retour arrière permettent d’ajouter des fonctionnalités sans jamais bloquer la caisse du client.",
"28":"La plupart des projets ratés le sont dès le recueil du besoin. Bien poser les questions vous fait livrer la bonne application, plus vite.",
"29":"Le tableau de bord web complète le résumé WhatsApp. Une vue SQL mal configurée suffit pourtant à montrer les ventes d’une boutique à une autre.",
"30":"À 200 boutiques, une panne silencieuse ou une facture d’IA mal estimée coûte cher. Reprises automatiques, alertes, tests et calcul des coûts rendent le service fiable et rentable.",
"31":"Un gérant qui sait lire ses indicateurs et régler ses alertes utilise le service chaque semaine, et le garde.",
"32":"L’épreuve Débutant vérifie les gestes de base (démarrer un projet, ranger les clés, utiliser les outils officiels) et le bon sens commercial. Sa réussite en mode Évaluation donne l’attestation Débutant.",
"34":"Une clinique à plusieurs médecins ne peut pas se permettre deux patients sur le même créneau. Un agenda partagé, protégé par la base de données, rend le SaaS n° 2 vendable aux établissements de taille moyenne.",
"35":"Un lien de paiement dans la relance transforme une promesse en paiement immédiat. Il réutilise exactement le circuit pawaPay des leçons 23 et 24.",
"36":"Un calendrier dans la base et une validation par WhatsApp garantissent qu’aucune publication ne part sans l’accord écrit du client, et gardent la preuve de cet accord.",
"37":"Savoir écrire un serveur MCP précis, en lecture seule, est ce que vous vendez avec le SaaS n° 12 : l’accès aux données du client sans lui faire courir de risque.",
"38":"Une revue de code utile parle des failles, pas du style. Écrire les règles de l’équipe dans CLAUDE.md rend le SaaS n° 13 pertinent pour chaque client.",
"39":"Inclure les messages WhatsApp dans l’abonnement n’est rentable que si le prix couvre les coûts de la boutique moyenne et qu’un seuil d’usage raisonnable protège contre les plus gros consommateurs. Ce calcul décide si votre SaaS gagne ou perd de l’argent.",
"40":"Lire une pièce d’identité avec l’IA fait gagner du temps à la microfinance, à condition de contrôler la cohérence, de ne jamais inventer un champ et de laisser la décision à un agent.",
"41":"Une date d’échéance n’a de valeur que si l’on sait où elle a été trouvée. Extraire avec la source, puis alerter à J-30, J-7 et J-1, c’est le cœur du SaaS de conformité.",
"42":"Chaque vidéo générée coûte des crédits, y compris celles que le client refuse. Calculer le coût par vidéo livrée évite de vendre des packs à perte.",
"43":"Livrer les fichiers automatiquement, par un lien privé et temporaire, fait gagner du temps au studio et protège le travail du client.",
"44":"Transformer un plan en visite web légère est la version abordable du SaaS de visites virtuelles : elle s’ouvre sur n’importe quel téléphone.",
"45":"Un modèle 3D trop lourd fait fuir le client mobile. Savoir l’alléger sans abîmer ce qui se vend est indispensable pour le configurateur.",
"46":"Un simulateur HSE réutilise ce simulateur pour former aux gestes de sécurité. Le contenu vient de l’expert du client ; l’outil prouve l’entraînement.",
"47":"Traiter des centaines d’assets à la main est impossible. Un pipeline testé sur un échantillon, avec un nommage strict et un rapport, rend le SaaS n° 11 rentable.",
"33":"L’épreuve Expert vérifie que vous savez mettre en production sans risque : secrets, paiements, droits d’accès, retour arrière et coûts. Sa réussite en mode Évaluation donne l’attestation Expert."}
lines=h.split('\n')
idx=[i for i,l in enumerate(lines) if l.startswith('const POURQUOI = {')]
assert len(idx)==1
lines[idx[0]]='const POURQUOI = '+json.dumps(P,ensure_ascii=False)+';'
# PRACTICES
s=[i for i,l in enumerate(lines) if l.startswith('const PRACTICES = [')][0]
e=[i for i,l in enumerate(lines) if l.startswith('const TH_ORDER')][0]
prac='''const PRACTICES = [
  {n:1, th:'Agents IA et WhatsApp', t:'Claude + WhatsApp = Agent IA en 10 minutes (sans coder)', u:YT('7DWrD_W0erg'), m:'M2', v:'Refaites-le avec l’API officielle WhatsApp Business et un numéro de test (leçon 4).'},
  {n:2, th:'Agents IA et WhatsApp', t:'J’ai transformé WhatsApp en SaaS avec une automatisation n8n', u:YT('MGjZhzkcwSw')+'&t=64s', m:'M2 · M3', v:'Comparez avec les leçons 4 et 7 : déclencheur, agent, base, envoi.'},
  {n:3, th:'Agents IA et WhatsApp', t:'J’ai créé un agent IA pour vendre sur WhatsApp (10 min)', u:YT('NepO0wx480k'), m:'M2', v:'Un agent commercial engage la boutique : consigne système stricte, aucun prix inventé (leçon 6).'},
  {n:4, th:'Agents IA et WhatsApp', t:'Créer ton 1er Agent IA sans coder en 30 min avec Claude Code (je te montre TOUT)', u:YT('eWN535AMIzQ'), m:'M1 · M2', v:'Gardez le contrôle : permissions, base de test, validation humaine.'},
  {n:5, th:'Agents IA et WhatsApp', t:'Comment utiliser Claude pour créer instantanément n’importe quel agent IA', u:YT('cojtfdiiAps'), m:'M2', v:'Donnez à chaque agent uniquement les outils nécessaires, en lecture seule d’abord.'},
  {n:6, th:'Sites web et SaaS', t:'Créer un SaaS avec Claude Code : guide complet', u:YT('CiUAlSZyKFM'), m:'M1 · M6', v:'Aucune clé API dans le code, RLS activée, relecture avant mise en ligne (leçons 1 et 3).'},
  {n:7, th:'Sites web et SaaS', t:'Claude Code : créer un site WordPress MAGNIFIQUE (guide ultime)', u:YT('GgDhVLK6VbM'), m:'M6', v:'Travaillez sur un site de test et enregistrez chaque étape avec Git (leçon 17).'},
  {n:8, th:'Terminal et MCP', t:'Le guide ultime pour comprendre les MCP (+ 3 démos)', u:YT('9RV5gttT6rA'), m:'M6', v:'Avant tout connecteur : qui l’a fabriqué, que peut-il faire, à quelles données accède-t-il ? (leçon 15).'},
  {n:9, th:'Vidéo et création', t:'Connecter Claude Code à Higgsfield (construire un workflow vidéo argentique)', u:YT('k9UIZ873NhY')+'&t=1s', m:'M4', v:'Calculez le coût en crédits de chaque vidéo avant de fixer vos packs (leçon 10).'},
  {n:10, th:'3D et jeux vidéo', t:'How To Connect Claude To Blender (vidéo en anglais)', u:YT('1fPKbaAO6Ug'), m:'M4 · M5', v:'Connecteur MCP local : installez-le sur un projet de test (leçon 11).'},
  {n:11, th:'3D et jeux vidéo', t:'J’ai donné le contrôle de Blender à Claude (le résultat est FOU)', u:YT('HMJ6XYzZf0U'), m:'M4 · M5', v:'Sauvegardez la scène avant de laisser Claude agir.'},
  {n:12, th:'3D et jeux vidéo', t:'Comment utiliser Claude Code dans Unreal Engine 5.8 ? (Alex)', u:YT('g1TLhqxHjEw'), m:'M5', v:'Un CLAUDE.md décrit le projet ; Git protège les versions ; vérifiez la licence Unreal (leçon 14).'},
];'''
lines[s:e]=prac.split('\n')
h='\n'.join(lines)
R("const TH_ORDER = ['Agents IA et WhatsApp','Réseaux sociaux et YouTube','Vidéo et création','Sites web et SaaS','Terminal et MCP','Modèles locaux et coûts','3D et jeux vidéo'];",
  "const TH_ORDER = ['Agents IA et WhatsApp','Sites web et SaaS','Terminal et MCP','Vidéo et création','3D et jeux vidéo'];")
R('/* ============ Module 11 : pratiques','/* ============ Module 9 : pratiques')
R('<h2>Module 11 · Pratiques en vidéo</h2>','<h2>Module 9 · Pratiques en vidéo</h2>')
import re
a=h.index('<p class="note" style="margin:0">Des démonstrations réelles'); b=h.index('</div>',a)
h=h[:a]+'''<p class="note" style="margin:0">Des démonstrations réelles des SaaS de ce parcours : agents WhatsApp, SaaS complets, MCP, vidéo IA, Blender et Unreal. Les vidéos s’ouvrent sur YouTube dans un nouvel onglet. Après chaque vidéo, cochez « Vue » et lisez le rappel : il relie la pratique aux leçons 1 à 22.</p>
    <p class="banner" style="margin:0">Vidéos externes de créateurs indépendants. Ni le formateur ni Anthropic n’en sont responsables, et certaines montrent des raccourcis à adapter : API officielles, comptes et numéros de test, données fictives, aucune clé dans le code.</p>'''+h[b:]

# ===== Niveaux : Débutant / Moyen / Expert =====
R('<div class="row" style="justify-content:space-between"><div class="seg" id="modtabs" role="group" aria-label="Modules"></div><span class="note" id="progressAll"></span></div>',
  '<div class="levelbar"><b>Mon niveau</b><div class="seg" id="levtabs" role="group" aria-label="Niveau du public"></div><span class="note" id="levelNote"></span></div>\n    <div class="row" style="justify-content:space-between"><div class="seg" id="modtabs" role="group" aria-label="Modules"></div><span class="note" id="progressAll"></span></div>')
R('/* bibliothèque */','/* bibliothèque */\n.levelbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}\n.levelbar>b{font-size:14px}\n.levelbar .note{flex:1 1 260px;min-width:0}\n#levtabs button{font-size:13px;padding:7px 12px}\n.tag.n1{background:var(--ok-soft);color:var(--ok)} .tag.n2{background:var(--accent-soft);color:var(--accent)} .tag.n3{background:var(--warn-soft);color:var(--fg)}')
R("let curMod = store.get('sim-mod', 1);",
  "let curMod = store.get('sim-mod', 1);\nconst NIV_LABEL = {1:'Débutant',2:'Moyen',3:'Expert'};\nconst NIV_NOTE = {0:'Toutes les leçons, de la plus simple à la plus avancée.',1:'Débutant : aucune expérience requise. Chaque leçon s’ouvre sur la démonstration, puis passez au mode Guidé.',2:'Moyen : vous connaissez les bases. Travaillez en mode Guidé, puis validez en Évaluation.',3:'Expert : production, sécurité et coûts. Les leçons s’ouvrent directement en Évaluation (sans flèche).'};\nconst NIV_MODE = {1:'demo',2:'guide',3:'eval'};\nlet curNiv = store.get('sim-niv', 0);")
R("  $('progressAll').textContent = `Progression : ${done} / ${course.length} exercices validés`;",
  "  $('progressAll').textContent = `Progression : ${done} / ${course.length} exercices validés`;\n"
  "  $('levtabs').innerHTML = [[0,'Tous'],[1,'Débutant'],[2,'Moyen'],[3,'Expert']].map(([v,l])=>`<button data-niv=\"${v}\" aria-pressed=\"${v===curNiv}\">${l}</button>`).join('');\n"
  "  $('levtabs').querySelectorAll('[data-niv]').forEach(b=>b.onclick=()=>{ curNiv=+b.dataset.niv; store.set('sim-niv',curNiv); renderLibrary(); });\n"
  "  const lv = curNiv ? course.filter(c=>c.niveau===curNiv) : course;\n"
  "  $('levelNote').textContent = NIV_NOTE[curNiv] + ` · ${lv.filter(passed).length} / ${lv.length} leçons validées`;")
R("  const list = curMod ? course.filter(sc=>sc.module===curMod).sort((a,b)=>a.lecon-b.lecon) : [...libShared, ...libLocal];",
  "  const list = curMod ? course.filter(sc=>sc.module===curMod && (!curNiv || sc.niveau===curNiv)).sort((a,b)=>(a.niveau-b.niveau)||(a.lecon-b.lecon)) : [...libShared, ...libLocal];")
R("    const tag = sc.tag ? sc.tag : sc.lecon ? `Leçon ${sc.lecon}` : sc._local ? 'Brouillon local' : 'Bibliothèque';",
  "    const tag = sc.tag ? sc.tag : sc.lecon ? `Leçon ${sc.lecon}` : sc._local ? 'Brouillon local' : 'Bibliothèque';\n    const nv = sc.niveau ? `<span class=\"tag n${sc.niveau}\">${NIV_LABEL[sc.niveau]}</span>` : '';")
R('<span class="tag${passed(sc)?\' done\':\'\'}">${tag}${passed(sc)?\' · validée\':\'\'}</span><b>',
  '<span class="row" style="gap:6px"><span class="tag${passed(sc)?\' done\':\'\'}">${tag}${passed(sc)?\' · validée\':\'\'}</span>${nv}</span><b>')
R("|| '<p class=\"note\">Aucun scénario dans cette rubrique.</p>';",
  "|| `<p class=\"note\">${curNiv ? 'Aucune leçon de niveau ' + NIV_LABEL[curNiv] + ' dans ce module. Choisissez un autre module ou « Tous ».' : 'Aucun scénario dans cette rubrique.'}</p>`;")
R("if(sc){ loadScenario(sc,'guide'); $('scTitle').scrollIntoView",
  "if(sc){ loadScenario(sc, NIV_MODE[curNiv] || 'guide'); $('scTitle').scrollIntoView")
R("  const lbl = sc.module && MODULES[sc.module-1] ? 'Module ' + sc.module + ' · ' + MODULES[sc.module-1] : (sc.logiciel || 'Exercice');",
  "  const lbl = (sc.module && MODULES[sc.module-1] ? 'Module ' + sc.module + ' · ' + MODULES[sc.module-1] : (sc.logiciel || 'Exercice')) + (sc.niveau ? ' · Niveau ' + NIV_LABEL[sc.niveau] : '');")
R("  const done = list.filter(c=>Math.max(best[c.id+':guide']||0, best[c.id+':eval']||0, (R[c.id]?.g)||0, (R[c.id]?.e)||0) >= 80).length;",
  "  const okc = c=>Math.max(best[c.id+':guide']||0, best[c.id+':eval']||0, (R[c.id]?.g)||0, (R[c.id]?.e)||0) >= 80;\n  const done = list.filter(okc).length;\n  const parNiv = [1,2,3].map(n=>`${NIV_LABEL[n]} ${list.filter(c=>c.niveau===n&&okc(c)).length} / ${list.filter(c=>c.niveau===n).length}`).join(' · ');")
R("Exercices validés : ${done} / ${list.length}. Validez","Exercices validés : ${done} / ${list.length} (${parNiv}). Validez")
open('simulateur-saas.html','w',encoding='utf8').write(h)

# ===== Trois attestations =====
a=h.index("const ATT_ID = 'lecon-22', ATT_MIN = 80;"); b=h.index("function renderAttest(){",a); e=h.index("\n}\n",b)+3
h=h[:a]+r"""const ATTS = [{n:1,id:'lecon-32',l:32},{n:2,id:'lecon-22',l:22},{n:3,id:'lecon-33',l:33}], ATT_MIN = 80;
const fmtDay = iso => { try { return new Date(iso).toLocaleDateString('fr-FR'); } catch(_) { return ''; } };
function renderAttest(){
  const el = $('attest'); if (!el) return;
  const best = store.get('sim-best',{}), R = (typeof myRes!=='undefined' && myRes) ? myRes : {}, list = courseList();
  const okc = c=>Math.max(best[c.id+':guide']||0, best[c.id+':eval']||0, (R[c.id]?.g)||0, (R[c.id]?.e)||0) >= 80;
  const done = list.filter(okc).length;
  const st = a => { const r = R[a.id] || {}, sc = Math.max(best[a.id+':eval']||0, r.e||0); return { sc, ok: sc >= ATT_MIN, date: r.ea }; };
  const nOk = ATTS.filter(a=>st(a).ok).length;
  el.innerHTML = `<div class="row" style="justify-content:space-between"><h2>Mes attestations</h2><span class="pill ${nOk?'ok':'no'}">${nOk} / 3 obtenue(s)</span></div>
    <div class="attgrid">${ATTS.map(a=>{ const s = st(a), lv = list.filter(c=>c.niveau===a.n);
      return `<div class="attcard${s.ok?' ok':''}"><div class="row" style="justify-content:space-between"><b>Attestation ${NIV_LABEL[a.n]}</b><span class="pill ${s.ok?'ok':'no'}">${s.ok?'Obtenue':'À obtenir'}</span></div>
        <span class="note">Leçons du niveau validées : ${lv.filter(okc).length} / ${lv.length}</span>
        <span class="note">${s.ok ? `Épreuve (leçon ${a.l}) réussie : <b>${s.sc} / 100</b>${s.date?' le '+esc(fmtDay(s.date)):''}.` : `Réussir l’épreuve (leçon ${a.l}) en mode <b>Évaluation</b> avec au moins ${ATT_MIN} / 100. Meilleur score : ${s.sc ? s.sc+' / 100' : 'pas encore tenté'}.`}</span>
        ${s.ok ? '' : `<button class="btn" data-att="${a.id}">Passer l’épreuve ${NIV_LABEL[a.n]}</button>`}</div>`; }).join('')}</div>
    <p class="note" style="margin:0">Exercices validés : ${done} / ${list.length}. Validez les leçons d’un niveau avant son épreuve. Chaque attestation est délivrée et signée par le formateur.</p>`;
  el.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>{ const s = COURSE.find(c=>c.id===b.dataset.att); if (s){ loadScenario(s,'eval'); $('scTitle').scrollIntoView({behavior:'smooth',block:'start'}); } });
}
"""+h[e:]
R('.levelbar>b{font-size:14px}','.levelbar>b{font-size:14px}\n.attgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}\n.attcard{border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;gap:6px;align-content:start;background:var(--bg);min-width:0}\n.attcard.ok{border-color:var(--ok);background:var(--ok-soft)}\n.attcard .btn{justify-self:start}')
R("    const A = L[ATT_ID] || {};\n","    const atts = ATTS.map(a=>{ const x = L[a.id] || {}; return { n:a.n, sc:x.e||0, ok:(x.e||0)>=ATT_MIN, d:x.ea }; });\n")
R("att:(A.e||0)>=ATT_MIN, attScore:A.e||0, attDate:A.ea };","atts, att:atts.some(x=>x.ok) };")
R("[rows.filter(r=>r.att).length,'Éligibles à l’attestation']","[rows.reduce((s,r)=>s+r.atts.filter(x=>x.ok).length,0),'Attestations obtenues']")
R("<th>Attestation (leçon 22)</th>","<th>Attestations</th>")
R("<td>${r.att?`<span class=\"pill ok\">Éligible · ${r.attScore}</span>`:(r.attScore?`Éval. ${r.attScore}`:'—')}</td>",
  "<td>${r.atts.map(x=>x.ok?`<span class=\"pill ok\">${NIV_LABEL[x.n]} · ${x.sc}</span>`:(x.sc?`<span class=\"pill no\">${NIV_LABEL[x.n]} · ${x.sc}</span>`:'')).join(' ') || '—'}</td>")
R("['Apprenant','Épreuve finale (Évaluation)','Date de réussite','Exercices validés','Score moyen','Éligible à l’attestation']",
  "['Apprenant','Exercices validés','Score moyen', ...[1,2,3].flatMap(n=>['Épreuve '+NIV_LABEL[n]+' (Évaluation)','Date de réussite '+NIV_LABEL[n],'Attestation '+NIV_LABEL[n]])]")
R("[r.name, r.attScore||'', r.attDate?fmtDay(r.attDate):'', r.ok+' / '+course.length, r.tried?r.avg:'', r.att?'Oui':'Non']",
  "[r.name, r.ok+' / '+course.length, r.tried?r.avg:'', ...r.atts.flatMap(x=>[x.sc||'', x.ok&&x.d?fmtDay(x.d):'', x.ok?'Oui':'Non'])]")
assert 'ATT_ID' not in h, 'ATT_ID left'
open('simulateur-saas.html','w',encoding='utf8').write(h)

# ===== Auteur et société =====
R('<div class="eyebrow">Académie SaaS · Claude Code, Supabase, n8n, WhatsApp</div>','<div class="eyebrow">ZandoBoss SARLU · Académie SaaS · Claude Code, Supabase, n8n, WhatsApp</div>')
R('Ce simulateur de formation n’est publié par aucun d’eux. Vérifiez prix et conditions d’utilisation le jour J.</p>',
  'Ce simulateur de formation n’est publié par aucun d’eux. Vérifiez prix et conditions d’utilisation le jour J.</p>\n      <p class="note" style="margin:4px 0 0;max-width:70ch">Conçu par MOTA LWAMBA RICKY · ZandoBoss SARLU (RCCM KNG/RCCM/23-B-00512) · +243 825 565 647 · motaricky243@gmail.com · zandoboss.com</p>')
R('Chaque attestation est délivrée et signée par le formateur.','Chaque attestation est délivrée et signée par ZandoBoss SARLU.')
R("filename:'attestations_simulateur_saas.csv'","filename:'attestations_zandoboss_simulateur_saas.csv'")
open('simulateur-saas.html','w',encoding='utf8').write(h)
# ===== Fonctions finales : assistance Claude, délivrance et vérification des attestations =====
R('''          <button class="btn primary" id="play" hidden>Pause</button>
        </div>''','''          <button class="btn primary" id="play" hidden>Pause</button>
        </div>
        <div class="askbox" id="askBox" hidden>
          <label for="askQ" class="note">Une question sur cette étape ? Claude vous répond (indisponible en mode Évaluation).</label>
          <textarea id="askQ" rows="2" placeholder="Ex. Pourquoi tester sur une base de test ?"></textarea>
          <div class="row"><button class="btn" id="askGo">Demander à Claude</button><span class="note" id="askNote"></span></div>
          <div class="askout" id="askOut" aria-live="polite" hidden></div>
        </div>''')
R('<div class="box" id="attest"></div>','''<div class="box" id="attest"></div>
    <div class="box" id="verifyBox">
      <h2>Vérifier une attestation</h2>
      <p class="note" style="margin:0">Un employeur ou une école saisit le code imprimé sur l’attestation pour vérifier qu’elle a bien été délivrée par ZandoBoss SARLU.</p>
      <div class="row"><input id="vCode" placeholder="Ex. ZB-7K2M9Q4T" autocomplete="off" spellcheck="false" style="max-width:260px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:7px;padding:8px 10px;font:14px var(--f-mono)"><button class="btn" id="vGo">Vérifier</button></div>
      <p class="note" id="vOut" style="margin:0" aria-live="polite"></p>
    </div>''')
R('#attest h2{margin:0}','''#attest h2{margin:0} #verifyBox h2{margin:0}
.askbox{display:grid;gap:6px;border-top:1px solid var(--line);padding-top:10px}
.askbox textarea{width:100%;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:7px;padding:7px 9px;font:14px var(--f-body);resize:vertical}
.askout{font-size:14px;line-height:1.5;background:var(--accent-soft);color:var(--fg);border-radius:8px;padding:10px 12px;white-space:pre-wrap}
.vok{color:var(--ok);font-weight:600} .verr{color:var(--err);font-weight:600}''')
R('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono','<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono')
R("const ATTS = [{n:1,id:'lecon-32',l:32},{n:2,id:'lecon-22',l:22},{n:3,id:'lecon-33',l:33}], ATT_MIN = 80;",
  "const ATTS = [{n:1,id:'lecon-32',l:32},{n:2,id:'lecon-22',l:22},{n:3,id:'lecon-33',l:33}], ATT_MIN = 80;\nlet SAMPLE = null, DL = null, MY_ATT = [], ATT_DOCS = [];")
# carte d'attestation : délivrée / en attente / à obtenir
R("""        ${s.ok ? '' : `<button class="btn" data-att="${a.id}">Passer l’épreuve ${NIV_LABEL[a.n]}</button>`}</div>`; }).join('')}</div>""",
  """        ${(()=>{ const iss = MY_ATT.find(x=>x.niveau===a.n);
          if (iss) return `<span class="note"><span class="pill ok">Délivrée</span> Code de vérification : <b>${esc(iss.code)}</b>${iss.delivreLe?' · le '+esc(fmtDay(iss.delivreLe)):''}</span><button class="btn primary" data-pdf="${esc(iss.code)}">Télécharger l’attestation (PDF)</button>`;
          if (s.ok) return '<span class="note">Épreuve réussie : l’attestation sera délivrée par ZandoBoss SARLU après vérification.</span>';
          return `<button class="btn" data-att="${a.id}">Passer l’épreuve ${NIV_LABEL[a.n]}</button>`; })()}</div>`; }).join('')}</div>""")
R("""  el.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>{ const s = COURSE.find(c=>c.id===b.dataset.att); if (s){ loadScenario(s,'eval'); $('scTitle').scrollIntoView({behavior:'smooth',block:'start'}); } });
}""","""  el.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>{ const s = COURSE.find(c=>c.id===b.dataset.att); if (s){ loadScenario(s,'eval'); $('scTitle').scrollIntoView({behavior:'smooth',block:'start'}); } });
  el.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>downloadPdf(b.dataset.pdf, b));
}
/* ============ Attestation en PDF (générée dans la page, enregistrée avec l’accord du visiteur) ============ */
async function downloadPdf(code, btn){
  const a = MY_ATT.find(x=>x.code===code) || ATT_DOCS.find(x=>x.code===code); if (!a) return;
  const say = t => { if (btn){ btn.textContent = t; setTimeout(()=>{ btn.textContent = 'Télécharger l’attestation (PDF)'; }, 4000); } };
  if (!window.jspdf || !DL){ say('Téléchargement indisponible ici'); return; }
  const { jsPDF } = window.jspdf, d = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' }), W = 297;
  d.setDrawColor(31,79,163); d.setLineWidth(1.2); d.rect(10,10,277,190); d.setLineWidth(0.4); d.rect(14,14,269,182);
  d.setFont('helvetica','bold'); d.setFontSize(12); d.setTextColor(31,122,82); d.text('ZANDOBOSS SARLU - ACADEMIE SAAS', W/2, 32, {align:'center'});
  d.setFontSize(30); d.setTextColor(20,33,61); d.text('Attestation de formation', W/2, 54, {align:'center'});
  d.setFont('helvetica','normal'); d.setFontSize(14); d.text('Simulateur SaaS - Claude Code', W/2, 66, {align:'center'});
  d.setFontSize(13); d.text('Cette attestation est délivrée à', W/2, 88, {align:'center'});
  d.setFont('helvetica','bold'); d.setFontSize(24); d.text(String(a.name||'Apprenant'), W/2, 102, {align:'center'});
  d.setFont('helvetica','normal'); d.setFontSize(13);
  d.text(`pour la réussite du parcours de niveau ${NIV_LABEL[a.niveau]||''}, épreuve en mode Évaluation : ${a.score} / 100.`, W/2, 116, {align:'center'});
  d.text(`Épreuve réussie le ${a.reussiLe?fmtDay(a.reussiLe):'-'} - attestation délivrée le ${fmtDay(a.delivreLe)}.`, W/2, 126, {align:'center'});
  d.setFontSize(11); d.setTextColor(91,104,128);
  d.text(`Code de vérification : ${a.code}`, W/2, 146, {align:'center'});
  d.text('Vérifiable dans le Simulateur SaaS, rubrique "Vérifier une attestation".', W/2, 153, {align:'center'});
  d.setTextColor(20,33,61); d.setFontSize(12); d.line(185,171,255,171); d.text('MOTA LWAMBA RICKY', 220, 178, {align:'center'});
  d.setFontSize(9.5); d.text('Gérant, ZandoBoss SARLU - RCCM KNG/RCCM/23-B-00512', 220, 184, {align:'center'});
  d.text('+243 825 565 647 - motaricky243@gmail.com - zandoboss.com', 75, 184, {align:'center'});
  try { await DL.save({ filename:`attestation-${a.code}.pdf`, data:d.output('blob') }); say('Attestation enregistrée'); }
  catch(e){ if (e?.code!=='declined') say('Téléchargement impossible'); }
}
/* ============ Vérification publique d’une attestation par son code ============ */
$('vGo').onclick = async () => {
  const code = $('vCode').value.trim().toUpperCase(), out = $('vOut');
  if (!/^ZB-[A-Z0-9]{8}$/.test(code)){ out.innerHTML = '<span class="verr">Code invalide.</span> Un code ressemble à ZB-7K2M9Q4T.'; return; }
  if (!db){ out.textContent = 'La vérification fonctionne dans la page publiée du simulateur.'; return; }
  out.textContent = 'Vérification…';
  try { const s = await db.collection('attestations').doc(code).get();
    if (!s.exists){ out.innerHTML = '<span class="verr">Aucune attestation ne correspond à ce code.</span>'; return; }
    const a = s.data();
    out.innerHTML = `<span class="vok">Attestation valide.</span> Délivrée par ZandoBoss SARLU à <b>${esc(a.name||'')}</b> · niveau ${esc(NIV_LABEL[a.niveau]||'')} · épreuve ${esc(a.score)} / 100 · délivrée le ${esc(fmtDay(a.delivreLe))}.`;
  } catch(_){ out.textContent = 'Vérification impossible pour le moment. Réessayez plus tard.'; }
};
$('vCode').addEventListener('keydown', e=>{ if (e.key==='Enter') $('vGo').click(); });
/* ============ Assistance par Claude (hors mode Évaluation) ============ */
function updateAsk(){ $('askBox').hidden = !SAMPLE || !P.sc || P.mode==='eval'; $('askOut').hidden = true; $('askNote').textContent = ''; }
let askCtl = null;
$('askGo').onclick = async () => {
  if (!SAMPLE || !P.sc || P.mode==='eval') return;
  const q = $('askQ').value.trim(); if (!q){ $('askNote').textContent = 'Écrivez d’abord votre question.'; return; }
  const st = P.sc.steps[Math.min(P.step, P.sc.steps.length-1)] || {};
  askCtl?.abort(); askCtl = new AbortController();
  const out = $('askOut'); out.hidden = false; out.textContent = 'Claude réfléchit…'; $('askGo').disabled = true; $('askNote').textContent = '';
  const prompt = `Tu es le tuteur du Simulateur SaaS Claude Code de ZandoBoss SARLU, une formation en français pour des entrepreneurs de Kinshasa qui construisent des SaaS avec Claude Code, Supabase, n8n, WhatsApp et pawaPay.\\nLeçon : ${P.sc.titre}\\nMode : ${P.mode==='demo'?'Démonstration':'Guidé'}\\nÉtape en cours : ${(st.say||'').replace(/\\[\\[|\\]\\]/g,'')}\\nExplication de l’étape : ${st.why||''}\\nQuestion de l’apprenant : ${q}\\n\\nRéponds en français simple, en 3 à 6 phrases courtes, avec une analogie si elle aide. Ne présente jamais un prix, un tarif ou une condition commerciale comme certain : renvoie vers la documentation officielle. Si la question sort de la formation, dis-le poliment.`;
  try { const r = await SAMPLE(prompt, { signal:askCtl.signal, cache:false, onText:({text})=>{ out.textContent = text; } }); out.textContent = r.text; if (r.truncated) $('askNote').textContent = 'Réponse coupée : posez une question plus précise.'; }
  catch(e){ if (e?.code==='not_granted'){ $('askBox').hidden = true; } else if (e?.code==='rate_limited'){ out.textContent = 'Trop de questions en peu de temps : réessayez dans une minute.'; } else if (e?.name!=='AbortError'){ out.textContent = e?.text || 'Réponse impossible pour le moment. Réessayez plus tard.'; } }
  finally { $('askGo').disabled = false; }
};""")
R("$('play').hidden = P.mode!=='demo'; $('play').textContent='Pause'; $('hint').hidden = P.mode!=='eval';",
  "$('play').hidden = P.mode!=='demo'; $('play').textContent='Pause'; $('hint').hidden = P.mode!=='eval'; updateAsk();")
R("""  initResults();
  if (db){""","""  initResults();
  (async()=>{ try { const [s, d] = await Promise.all([window.claude?.use?.('sample') ?? null, window.claude?.use?.('downloads') ?? null]); SAMPLE = s; DL = d; updateAsk(); renderAttest(); } catch(_){} })();
  if (db && meId) db.collection('attestations').where('learnerId','==',meId).onSnapshot(s=>{ MY_ATT = s.docs.map(d=>({...d.data(), code:d.id})); renderAttest(); }, ()=>{});
  if (db && isOwner) db.collection('attestations').onSnapshot(s=>{ ATT_DOCS = s.docs.map(d=>({...d.data(), code:d.id})); if (!$('results').hidden) renderResults(); }, ()=>{});
  if (db){""")
R("""<td>${r.atts.map(x=>x.ok?`<span class="pill ok">${NIV_LABEL[x.n]} · ${x.sc}</span>`:(x.sc?`<span class="pill no">${NIV_LABEL[x.n]} · ${x.sc}</span>`:'')).join(' ') || '—'}</td>""",
  """<td>${attCell(r)}</td>""")
R("""  $('resTable').querySelectorAll('[data-det]').forEach(b=>b.onclick=()=>{ resSel = b.dataset.det; renderResults(); });""",
  """  $('resTable').querySelectorAll('[data-det]').forEach(b=>b.onclick=()=>{ resSel = b.dataset.det; renderResults(); });
  $('resTable').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>issueAtt(b, rows));
  $('resTable').querySelectorAll('[data-pdfo]').forEach(b=>b.onclick=()=>downloadPdf(b.dataset.pdfo, null));""")
R("""async function renderResults(){""","""function attCell(r){
  return r.atts.map(x=>{ const iss = ATT_DOCS.find(d=>d.learnerId===r.id && d.niveau===x.n);
    if (iss) return `<span class="pill ok">${NIV_LABEL[x.n]} · délivrée</span> <button class="mini" data-pdfo="${esc(iss.code)}">PDF</button>`;
    if (x.ok) return `<span class="pill ok">${NIV_LABEL[x.n]} · ${x.sc}</span> <button class="mini" data-issue="${esc(r.id)}|${x.n}|${x.sc}|${esc(x.d||'')}">Délivrer</button>`;
    return x.sc ? `<span class="pill no">${NIV_LABEL[x.n]} · ${x.sc}</span>` : ''; }).join(' ') || '—';
}
const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint32Array(8); crypto.getRandomValues(b); return 'ZB-' + [...b].map(v=>A[v % A.length]).join(''); };
async function issueAtt(btn, rows){
  const [id, n, sc, d] = btn.dataset.issue.split('|'), r = rows.find(x=>x.id===id); if (!db || !r) return;
  btn.disabled = true; btn.textContent = 'Délivrance…';
  try { await db.collection('attestations').doc(newCode()).set({ learnerId:id, name:r.name, niveau:+n, score:+sc, reussiLe:d||null, delivreLe:new Date().toISOString(), delivrePar:'ZandoBoss SARLU' }); }
  catch(e){ btn.disabled = false; btn.textContent = 'Délivrer'; $('resCount').textContent = 'Délivrance refusée (' + (e?.code||'erreur') + ').'; }
}
async function renderResults(){""")
open('simulateur-saas.html','w',encoding='utf8').write(h)

print(len(h))
