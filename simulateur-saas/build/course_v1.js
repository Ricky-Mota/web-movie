/* ===== Scénarios « Simulateur SaaS — Claude Code » : chaque étape = un écran, une rubrique, une action ===== */
window.COURSE = (() => {
const { CC, DECIDE, TERM, APP, I, compile } = SIM;
const out = [];
const L = (lecon, module, titre, logiciel, fn) => { const steps = []; fn((scr,t,action,say,why,expect)=>steps.push({scr,t,action,say,why,expect})); out.push(compile({lecon,module,titre,logiciel,steps})); };

/* Demande de permission : ok = 0 (Oui), 1 (Oui, ne plus demander) ou 2 (Non) */
const PERM = (title, lines, ok) => ({ title, lines, opts:[
  {id: ok===0?'ok':'p-yes', label:'Oui'},
  {id: ok===1?'ok':'p-always', label:'Oui, et ne plus demander pour ce type d’action'},
  {id: ok===2?'ok':'p-no', label:'Non, et dire à Claude ce qu’il doit faire autrement'} ]});
/* Série de mises en situation : la bonne réponse porte l'identifiant "ok" */
const Q = (S, brand, list) => list.forEach((x,i)=>{
  const opts = x.o.map((l,j)=>({ id: j===x.ok?'ok':'x'+j, label:l, c:(x.c||[])[j] }));
  S(DECIDE({brand, count:`Situation ${i+1} / ${list.length}`, ctx:x.ctx, q:x.q, opts}), 'ok', 'clic', x.say || 'Lisez la situation, puis cliquez sur la bonne réponse.', x.why);
});
const SHELL = (lines, title) => TERM({ title: title || 'dev@saas : ~/projets', lines });

/* ---------- Éditeur de workflows (reproduction simplifiée, type n8n) ---------- */
const RES = {
  wa:  {id:'res-wa',  label:'WhatsApp Trigger',        desc:'Message reçu sur le numéro Business', c:'#25a35a', ico:'WA'},
  wh:  {id:'res-wh',  label:'Webhook',                 desc:'Requête HTTP reçue',                  c:'#7b3fa0', ico:'⇣'},
  sch: {id:'res-sch', label:'Schedule Trigger',        desc:'Lance le flux à heure fixe',          c:'#5b6880', ico:'◷'},
  ai:  {id:'res-ai',  label:'Agent IA (Claude)',       desc:'Comprend et rédige la réponse',       c:'#c2410c', ico:'AI'},
  db:  {id:'res-db',  label:'Supabase',                desc:'Lire ou écrire des lignes',           c:'#1d8a52', ico:'DB'},
  was: {id:'res-was', label:'WhatsApp · Envoyer',      desc:'Envoie un message ou un modèle',      c:'#25a35a', ico:'WA'},
  http:{id:'res-http',label:'HTTP Request',            desc:'Appelle une API externe',             c:'#1f4fa3', ico:'API'},
  wait:{id:'res-wait',label:'Attendre une validation', desc:'Une personne approuve avant la suite', c:'#d97706', ico:'✓'},
};
const ND = {
  wa:  {id:'n-wa',  label:'WhatsApp Trigger', sub:'message reçu',   c:'#25a35a', ico:'WA'},
  ai:  {id:'n-ai',  label:'Agent IA (Claude)',sub:'rédige',         c:'#c2410c', ico:'AI'},
  db:  {id:'n-db',  label:'Supabase',         sub:'enregistre',     c:'#1d8a52', ico:'DB'},
  was: {id:'n-was', label:'WhatsApp',         sub:'envoie',         c:'#25a35a', ico:'WA'},
  sch: {id:'n-sch', label:'Schedule Trigger', sub:'heure fixe',     c:'#5b6880', ico:'◷'},
  wh:  {id:'n-wh',  label:'Formulaire',       sub:'photo produit',  c:'#7b3fa0', ico:'⇣'},
  vid: {id:'n-vid', label:'Générateur vidéo', sub:'API Higgsfield', c:'#7c3aed', ico:'▶'},
  ok:  {id:'n-ok',  label:'Validation',       sub:'par le client',  c:'#d97706', ico:'✓'},
};
const FLOW = (o={}) => {
  const it=[], ns=o.nodes||[], x0=250, y0=250, sp=180;
  it.push(I('btn','test',560,8,120,34,{label:'Tester le flux'}), I('btn','save',690,8,120,34,{label:'Enregistrer'}), I('toggle','active',830,10,150,30,{label:o.active?'Actif':'Inactif',on:!!o.active}));
  if (!ns.length) it.push(I('addfirst','add-first',x0+40,190,140,140));
  ns.forEach((n,i)=>{ const x=x0+i*sp; if(i) it.push(I('raw',null,0,0,0,0,{svg:`<line x1="${x-30}" y1="${y0+43}" x2="${x}" y2="${y0+43}" stroke="#9aa6b8" stroke-width="2"/>`})); it.push(I('node',n.id,x,y0,150,86,n)); });
  if (ns.length && ns.length<4 && !o.noPlus){ const x=x0+(ns.length-1)*sp+150; it.push(I('raw',null,0,0,0,0,{svg:`<line x1="${x}" y1="${y0+43}" x2="${x+14}" y2="${y0+43}" stroke="#9aa6b8" stroke-width="2"/>`}), I('plus','add-next',x+14,y0+30,26,26)); }
  if (o.drawer){ it.push(I('box',null,640,50,360,550,{fill:'#fff',r:0}), I('text',null,660,86,0,0,{label:'Que voulez-vous ajouter ?',wt:700,size:14}), I('field','search',660,100,320,34,{value:o.drawer.q||'',ph:'Rechercher un nœud…'})); (o.drawer.res||[]).forEach((r,i)=>it.push(I('res',r.id,660,150+i*62,320,54,r))); }
  (o.extra||[]).forEach(x=>it.push(x));
  return APP({brand:'Workflows (type n8n)',logo:'⚙',color:'#ea4b71',side:[{id:'nav-wf',label:'Workflows',on:true},{id:'nav-cred',label:'Identifiants'},{id:'nav-exec',label:'Exécutions'}],
    title:o.title, subtitle:o.subtitle||(o.active?'Actif : répond en production':'Inactif : mode test'), items:it, dialog:o.dialog, toast:o.toast});
};
const DLG = (title, fields, h, btn) => ({ title, fields, h:h||330, buttons:[{id:'close',lab:btn||'Fermer',primary:true}] });

/* ---------- Messagerie (reproduction simplifiée, type WhatsApp) ---------- */
const WA = (o={}) => {
  const it=[]; let y=140;
  (o.msgs||[]).forEach(m=>{ const ls=String(m.t).split('\n'); const h=ls.length*18+24; const w=Math.min(560, Math.max(...ls.map(l=>l.length))*7.3+70);
    it.push(I('msg',m.id||null,m.me?970-w:240,y,w,h,{label:m.t,me:!!m.me,time:m.time||''})); y+=h+10; });
  it.push(I('field','wa-in',240,548,620,40,{value:o.input||'',ph:'Écrire un message'}), I('btn','wa-send',870,548,100,40,{label:'Envoyer',green:true}));
  return APP({brand:'Messagerie (type WhatsApp)',logo:'WA',color:'#25a35a',side:o.side||[{id:'c-1',label:'Boutique Mama Ngozi',on:true},{id:'c-2',label:'Numéro de test'}],title:o.title,subtitle:o.subtitle,items:it,toast:o.toast});
};

/* ---------- Console base de données (reproduction simplifiée, type Supabase) ---------- */
const DBC = (o={}) => APP({brand:'Console base (type Supabase)',logo:'DB',color:'#1d8a52',
  side:[{id:'nav-tables',label:'Éditeur de tables',on:o.nav==='tables'},{id:'nav-sql',label:'Éditeur SQL',on:o.nav==='sql'},{id:'nav-auth',label:'Authentification',on:o.nav==='auth'},{id:'nav-storage',label:'Stockage',on:o.nav==='storage'},{id:'nav-api',label:'Clés API',on:o.nav==='api'}],
  title:o.title||'Projet vendeur-whatsapp', subtitle:o.subtitle||'Base PostgreSQL · offre gratuite', items:o.items||[], dialog:o.dialog, toast:o.toast});
const SQL = (value, extra, toast) => DBC({nav:'sql', toast, items:[
  I('field','sql',240,160,730,150,{lab:'Requête SQL',value,ph:'Tapez votre requête…',mono:true}),
  I('btn','run',850,326,120,34,{label:'Exécuter',primary:true}), ...(extra||[])]});

/* ========================= MODULE 1 — Socle commun ========================= */
L(1,1,'Leçon 1 — Démarrer un projet SaaS avec Claude Code','Terminal et Claude Code',S=>{
  const t0=['$ # Nouveau projet : le vendeur WhatsApp (SaaS n° 1)'];
  S(SHELL(t0),'term-in','saisie','Créez le dossier du projet : [[mkdir vendeur-whatsapp]].','Un dossier par SaaS : Claude Code ne voit que le dossier où il est lancé.','mkdir vendeur-whatsapp');
  const t1=[...t0,'$ mkdir vendeur-whatsapp'];
  S(SHELL(t1),'term-in','saisie','Entrez dans le dossier : [[cd vendeur-whatsapp]].','On lance toujours Claude Code depuis le dossier du projet.','cd vendeur-whatsapp');
  const d='~/projets/vendeur-whatsapp', t2=[...t1,'$ cd vendeur-whatsapp'];
  S(SHELL(t2,'dev@saas : '+d),'term-in','saisie','Activez l’historique des versions : [[git init]].','Git garde chaque version : indispensable avant de laisser un agent écrire du code.','git init');
  const t3=[...t2,'$ git init','✔ Dépôt Git vide initialisé'];
  S(SHELL(t3,'dev@saas : '+d),'term-in','saisie','Lancez l’agent : [[claude]].','Claude Code va lire, planifier, écrire et vérifier le code de votre SaaS.','claude');
  S(CC({dir:d}),'cc-in','saisie','Créez la mémoire du projet : tapez [[/init]].','/init rédige un CLAUDE.md : la fiche que Claude relit à chaque session.','/init');
  S(CC({dir:d,lines:['> /init','● Projet vide : je propose un CLAUDE.md pour un SaaS WhatsApp + Supabase + n8n'],perm:PERM('Claude souhaite créer le fichier : CLAUDE.md',['Mémoire du projet, lue automatiquement à chaque session'],0)}),'ok','clic','Acceptez la création du [[CLAUDE.md]].','Créer un fichier de documentation est sans risque.');
  S(CC({dir:d+'/CLAUDE.md',noHead:true,lines:['# CLAUDE.md — Vendeur WhatsApp','## Produit : assistant de vente WhatsApp pour PME (catalogue, commandes, relances)','## Pile : WhatsApp Cloud API · n8n · API Claude · Supabase · GitHub',{id:'l-secret',t:'## Secrets : jamais dans le code ; clés dans .env, fichier ignoré par Git'},'## Données : chaque boutique ne voit que ses lignes (RLS obligatoire)','## Tests : toute modification de la base est testée sur une base de test']}),'l-secret','clic','Repérez la règle sur les [[Secrets]].','Une clé API publiée sur GitHub est compromise en quelques minutes.');
  S(CC({dir:d}),'cc-in','saisie','Appliquez la règle : [[Ajoute .env au .gitignore]].','Le fichier .env contiendra les clés WhatsApp, Supabase et Claude.','Ajoute .env au .gitignore');
  S(CC({dir:d,lines:['> Ajoute .env au .gitignore'],perm:PERM('Claude souhaite créer le fichier : .gitignore',['Ajout des lignes : .env, node_modules/'],0)}),'ok','clic','Votre réponse ?','Vous gardez le contrôle : rien n’est créé sans votre accord.');
});

L(2,1,'Leçon 2 — Choisir la bonne brique du socle','Mises en situation',S=>{
  const o=['Claude Code','Supabase','n8n','API Claude','GitHub'];
  Q(S,'Le socle commun',[
    {q:'Stocker le catalogue, les clients et les commandes,\navec un accès limité par rôle.',o,ok:1,why:'Supabase : base PostgreSQL, authentification, stockage de fichiers et règles d’accès (RLS).'},
    {q:'Enchaîner automatiquement : message reçu → réponse IA →\nenregistrement → relance.',o,ok:2,why:'n8n orchestre les étapes, comme une chaîne de montage.'},
    {q:'Rédiger une réponse personnalisée au client, en direct,\nà chaque message reçu par le produit.',o,ok:3,why:'L’API Claude est appelée par votre produit. Claude Code, lui, vous aide à construire le produit.'},
    {q:'Écrire et modifier le code du back-office et des scripts.',o,ok:0,why:'Claude Code est votre développeur assistant, dans le terminal.'},
    {q:'Garder l’historique du code et faire relire chaque modification.',o,ok:4,why:'GitHub : versions, propositions de modification (PR) et revue.'},
    {q:'Quel budget de départ viser pour le socle ?',o:['Les offres gratuites (Supabase, n8n auto-hébergé, GitHub), puis payer quand les clients paient','Les offres entreprise dès le premier jour','Des serveurs dédiés achetés à l’avance'],ok:0,why:'Gratuité d’abord : on paie l’infrastructure quand les revenus arrivent.'},
  ]);
});

L(3,1,'Leçon 3 — Créer la base de données et la protéger (RLS)','Console base de données (simulée)',S=>{
  S(DBC({nav:'tables',items:[I('box',null,240,150,730,110,{title:'Aucune table pour l’instant'}),I('lines',null,256,206,700,0,{lines:['Créez vos tables avec l’éditeur SQL, à partir du script préparé par Claude Code.']})]}),'nav-sql','clic','Ouvrez l’[[Éditeur SQL]].','Claude Code a préparé le script de création dans supabase/migrations/.');
  const create='create table produits (\n  id bigint primary key generated always as identity,\n  boutique_id uuid not null,\n  nom text not null,\n  prix_cdf numeric not null,\n  stock int default 0 );';
  S(SQL(create),'run','clic','Relisez le script, puis cliquez sur [[Exécuter]].','On relit toujours un script avant de l’exécuter sur une base.');
  S(SQL(create,[I('row','l-rls',240,380,730,40,{cells:['⚠ RLS désactivée : toute personne qui a la clé publique peut lire cette table'],cw:[720],on:true})],'Table produits créée'),'l-rls','clic','Repérez l’[[alerte RLS]].','Sans RLS (sécurité au niveau des lignes), la clé publique de votre app permet de lire toutes les lignes.');
  S(SQL(''),'sql','saisie','Activez la protection : tapez [[alter table produits enable row level security]].','Une fois la RLS activée, aucune ligne n’est lisible sans règle explicite.','alter table produits enable row level security');
  S(SQL('alter table produits enable row level security'),'run','clic','Cliquez sur [[Exécuter]].','');
  S(SQL('alter table produits enable row level security',[I('row',null,240,380,730,40,{cells:['✔ RLS activée sur produits'],cw:[720]})],'RLS activée'),'nav-api','clic','Ouvrez maintenant les [[Clés API]].','Deux clés existent : il faut savoir où va chacune.');
  S(DBC({nav:'api',title:'Clés API',items:[I('row',null,240,150,730,36,{head:true,cells:['Clé','Usage'],cw:[280,440]}),I('row','k-pub',240,186,730,40,{cells:['Clé publique (anon / publishable)','Peut aller dans l’app : protégée par la RLS'],cw:[280,440]}),I('row','k-secret',240,226,730,40,{cells:['Clé secrète (service_role)','Contourne la RLS : serveur uniquement'],cw:[280,440]})]}),'k-secret','clic','Repérez la [[clé secrète]].','Elle contourne toutes les règles RLS : c’est la clé du coffre.');
  Q(S,'Où ranger la clé ?',[{q:'Où ranger la clé secrète service_role ?',o:['Dans le code de la page web','Dans les identifiants de n8n et les variables du serveur, jamais dans Git','Dans le groupe WhatsApp de l’équipe'],ok:1,why:'Une clé secrète ne quitte jamais le serveur.'}]);
});

/* ========================= MODULE 2 — SaaS n° 1 : Vendeur WhatsApp ========================= */
L(4,2,'Leçon 4 — Construire le workflow du vendeur WhatsApp','Workflows (type n8n), simulé',S=>{
  const t='Vendeur WhatsApp — Boutique Mama Ngozi';
  S(FLOW({title:t}),'add-first','clic','Cliquez sur [[+]] pour ajouter le premier déclencheur.','Tout workflow commence par un déclencheur : ici, un message client.');
  S(FLOW({title:t,drawer:{res:[RES.wa,RES.wh,RES.sch]}}),'search','saisie','Tapez [[WhatsApp]] dans la recherche.','La recherche est le moyen le plus rapide de trouver un nœud.','WhatsApp');
  S(FLOW({title:t,drawer:{q:'WhatsApp',res:[RES.wa,RES.was]}}),'res-wa','clic','Sélectionnez [[WhatsApp Trigger]].','Il se déclenche à chaque message reçu sur votre numéro WhatsApp Business.');
  const f0=[{id:'cred',k:'select',lab:'Identifiant (compte WhatsApp Business)',ph:'Choisir un identifiant…'},{id:'upd',k:'select',lab:'Événement',value:'messages'}];
  S(FLOW({title:t,nodes:[ND.wa],dialog:DLG('WhatsApp Trigger',f0)}),'cred','clic','Ouvrez la liste [[Identifiant]].','');
  S(FLOW({title:t,nodes:[ND.wa],dialog:DLG('WhatsApp Trigger',[{...f0[0],menu:[{id:'cred-ok',label:'WhatsApp Business · numéro de test'},{id:'cred-perso',label:'Mon numéro personnel (appli WhatsApp)'}]},f0[1]])}),'cred-ok','clic','Choisissez le [[numéro de test]] WhatsApp Business.','Uniquement l’API officielle (WhatsApp Cloud API), d’abord avec un numéro de test.');
  S(FLOW({title:t,nodes:[ND.wa],dialog:DLG('WhatsApp Trigger',[{...f0[0],value:'WhatsApp Business · numéro de test'},f0[1]])}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[ND.wa]}),'add-next','clic','Cliquez sur le [[+]] à droite du déclencheur.','Chaque nœud transmet ses données au suivant.');
  S(FLOW({title:t,nodes:[ND.wa],drawer:{res:[RES.ai,RES.db,RES.http]}}),'res-ai','clic','Ajoutez l’[[Agent IA (Claude)]].','C’est lui qui comprend la demande du client et rédige la réponse.');
  const fa=[{id:'model',k:'select',lab:'Modèle',value:'claude-sonnet-5-5'},{id:'sys',lab:'Consigne système',h:90,value:'Tu es le vendeur de la Boutique Mama Ngozi.\nRéponds poliment, en français.\nN’invente jamais un prix : utilise l’outil Catalogue.\nClient qui demande un humain : transmets au gérant.'},{id:'tool',lab:'Outils',value:'Catalogue (Supabase · lecture seule)'}];
  S(FLOW({title:t,nodes:[ND.wa,ND.ai],dialog:DLG('Agent IA (Claude)',fa,390)}),'sys','clic','Lisez la [[consigne système]].','C’est le contrat de l’agent : rôle, ton, interdiction d’inventer un prix, passage à un humain.');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai],dialog:DLG('Agent IA (Claude)',fa,390)}),'tool','clic','Vérifiez l’[[outil]] branché.','En lecture seule : l’agent consulte le catalogue mais ne peut pas le modifier.');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai],dialog:DLG('Agent IA (Claude)',fa,390)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai]}),'add-next','clic','Ajoutez l’étape suivante : [[+]].','');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai],drawer:{res:[RES.db,RES.was,RES.http]}}),'res-db','clic','Ajoutez [[Supabase]] pour enregistrer la commande.','Chaque commande est enregistrée avec l’identifiant de la boutique.');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai,ND.db]}),'add-next','clic','Dernière étape : [[+]].','');
  S(FLOW({title:t,nodes:[ND.wa,ND.ai,ND.db],drawer:{res:[RES.was,RES.http,RES.wait]}}),'res-was','clic','Ajoutez [[WhatsApp · Envoyer]] pour répondre au client.','La réponse part sur le même numéro, dans la fenêtre de 24 h ouverte par le client.');
  const all=[ND.wa,ND.ai,ND.db,ND.was];
  S(FLOW({title:t,nodes:all}),'save','clic','Cliquez sur [[Enregistrer]].','Un workflow non enregistré est perdu à la fermeture.');
  S(FLOW({title:t,nodes:all,toast:'Workflow enregistré'}),'active','clic','Activez le workflow avec l’interrupteur [[Inactif]].','Actif : chaque message reçu sur le numéro de test déclenche le flux.');
});

L(5,2,'Leçon 5 — Faire coder les commandes et les relances par Claude Code','Claude Code',S=>{
  const d='~/projets/vendeur-whatsapp';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Avant de toucher à la base, passez en [[mode plan]].','En mode plan, Claude analyse et propose sans rien modifier.');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Prépare les tables commandes et paniers avec RLS]].','Le CLAUDE.md rappelle déjà la pile technique et les règles de sécurité.','Prépare les tables commandes et paniers avec RLS');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:['> Prépare les tables commandes et paniers avec RLS','● Plan proposé :','  1. Migration supabase/migrations/002_commandes.sql (commandes, lignes, paniers)','  2. RLS : chaque boutique ne voit que ses lignes (boutique_id du compte connecté)','  3. Relance des paniers abandonnés après 24 h (fonction + workflow n8n)',{id:'l-test',t:'  4. Tests : un compte d’une autre boutique ne doit voir aucune ligne'}]}),'l-test','clic','Repérez l’étape de [[Tests]] du plan.','Un bon plan prévoit de prouver que la sécurité fonctionne.');
  S(CC({dir:d}),'cc-in','saisie','Plan validé, mode par défaut rétabli. Tapez [[Exécute le plan]].','','Exécute le plan');
  S(CC({dir:d,lines:['> Exécute le plan'],perm:PERM('Claude souhaite créer : supabase/migrations/002_commandes.sql',['Nouveau fichier de migration · rien n’est encore appliqué'],0)}),'ok','clic','Créer le fichier de migration : votre réponse ?','Écrire un fichier ne change pas encore la base.');
  S(CC({dir:d,lines:['✔ 002_commandes.sql créé'],perm:PERM('Claude souhaite exécuter : supabase db push --linked',['Applique la migration directement sur la base des clients réels'],2)}),'ok','clic','Claude veut appliquer la migration sur la base de production. Votre réponse ?','D’abord la base de test : on n’applique en production qu’après relecture et tests.');
  S(CC({dir:d,lines:['● J’applique sur la base de test.'],perm:PERM('Claude souhaite lire : .env',['Contient SUPABASE_SERVICE_ROLE_KEY et WHATSAPP_TOKEN'],2)}),'ok','clic','Claude veut lire le fichier des secrets. Votre réponse ?','Inutile pour écrire le code. Ajoutez une règle deny sur .env dans les permissions.');
  S(CC({dir:d,lines:['✔ Migration appliquée sur la base de test',{id:'l-ok',t:'✔ Test RLS : compte d’une autre boutique → 0 ligne visible'}]}),'l-ok','clic','Cliquez sur le résultat du [[Test RLS]].','La preuve que les données d’une boutique restent privées.');
  S(CC({dir:d,lines:['✔ Tests réussis']}),'cc-in','saisie','Enregistrez une version : [[Enregistre une version]].','Chaque étape validée devient une version Git.','Enregistre une version');
  S(CC({dir:d,lines:['> Enregistre une version'],perm:PERM('Claude souhaite exécuter : git commit -m "Tables commandes et paniers avec RLS, testées"',[],0)}),'ok','clic','Message clair (quoi + pourquoi) : validez.','');
});

L(6,2,'Leçon 6 — Tester le vendeur comme un client','Messagerie (type WhatsApp), simulée',S=>{
  const T={title:'Test sur le numéro de test',subtitle:'Vous jouez le rôle du client'};
  const m1={t:'Bonjour, vous avez le pagne wax bleu ?',me:1,time:'10:02'};
  S(WA(T),'wa-in','saisie','Écrivez comme un client : [[Bonjour, vous avez le pagne wax bleu ?]]','On teste toujours le parcours complet avant de vendre le service.','Bonjour, vous avez le pagne wax bleu ?');
  S(WA({...T,input:m1.t}),'wa-send','clic','Cliquez sur [[Envoyer]].','');
  const m2={id:'m-price',t:'Oui ! Pagne wax bleu 6 yards : 45 000 CDF.\nStock : 3 pièces. Je vous le réserve ?',time:'10:02'};
  S(WA({...T,msgs:[m1,m2]}),'m-price','clic','Vérifiez le [[prix]] annoncé dans la réponse.','Le prix vient de l’outil Catalogue : comparez avec la base. Un agent ne doit jamais inventer un prix.');
  S(WA({...T,msgs:[m1,{...m2,id:null}]}),'wa-in','saisie','Confirmez : [[Oui, livraison à Gombe]].','','Oui, livraison à Gombe');
  S(WA({...T,msgs:[m1,{...m2,id:null}],input:'Oui, livraison à Gombe'}),'wa-send','clic','Cliquez sur [[Envoyer]].','');
  S(WA({...T,msgs:[m1,{...m2,id:null},{t:'Oui, livraison à Gombe',me:1,time:'10:03'},{id:'m-cmd',t:'Commande n° 1042 enregistrée ✔\nPaiement : Mobile Money ou à la livraison.',time:'10:03'}]}),'m-cmd','clic','Repérez la [[commande enregistrée]].','Vérifiez qu’elle apparaît bien dans la table commandes de Supabase.');
  Q(S,'Mettre le vendeur en service',[
    {q:'Un client écrit : « Je veux parler à quelqu’un, c’est urgent. »',o:['L’agent continue de répondre seul','L’agent transmet à un humain et prévient le gérant'],ok:1,why:'Le passage à un humain est prévu dans la consigne système.'},
    {q:'Le client demande une remise de 50 %.',o:['L’agent accepte pour conclure la vente','L’agent applique seulement les remises prévues dans la base, sinon il transmet au gérant'],ok:1,why:'Un agent commercial engage la boutique : il reste dans le cadre fixé.'},
    {q:'Relance des paniers abandonnés : comment ?',o:['Toutes les heures jusqu’à l’achat','Une relance après 24 h avec un modèle approuvé par Meta, et arrêt si le client écrit STOP'],ok:1,why:'Hors de la fenêtre de 24 h, WhatsApp impose des modèles approuvés, souvent facturés. Trop de relances = numéro bloqué.'},
    {q:'Comment facturer ce SaaS à la boutique ?',o:['Abonnement mensuel par boutique, coûts WhatsApp inclus ou refacturés','Gratuit à vie','Prix unique, sans tenir compte des messages'],ok:0,why:'Abonnement par boutique, avec une option de paiement mobile intégré.'},
  ]);
});

/* ========================= MODULE 3 — SaaS n° 2, 3, 4 : Services WhatsApp ========================= */
L(7,3,'Leçon 7 — Rendez-vous et rappels automatiques','Workflows (type n8n), simulé',S=>{
  const t='Rappels — Clinique Sainte Grâce';
  const sch={...ND.sch,sub:'chaque jour 18:00'}, db={...ND.db,sub:'RDV de demain'}, was={...ND.was,sub:'modèle rappel_rdv'};
  S(FLOW({title:t}),'add-first','clic','Ajoutez le premier déclencheur : [[+]].','');
  S(FLOW({title:t,drawer:{res:[RES.wa,RES.wh,RES.sch]}}),'res-sch','clic','Choisissez [[Schedule Trigger]].','Le rappel part à heure fixe, sans action de quiconque.');
  const fs=[{id:'freq',k:'select',lab:'Déclencher',value:'Chaque jour'},{id:'hour',lab:'Heure',ph:'ex. 18:00'}];
  S(FLOW({title:t,nodes:[ND.sch],dialog:DLG('Schedule Trigger',fs)}),'hour','saisie','Dans [[Heure]], tapez [[18:00]].','La veille au soir : le patient a le temps de confirmer ou d’annuler.','18:00');
  S(FLOW({title:t,nodes:[sch],dialog:DLG('Schedule Trigger',[fs[0],{...fs[1],value:'18:00'}])}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[sch]}),'add-next','clic','Ajoutez l’étape suivante : [[+]].','');
  S(FLOW({title:t,nodes:[sch],drawer:{res:[RES.db,RES.ai,RES.http]}}),'res-db','clic','Ajoutez [[Supabase]].','On lit les rendez-vous du lendemain.');
  const fd=[{id:'op',k:'select',lab:'Opération',value:'Lire des lignes'},{id:'table',lab:'Table',value:'rendez_vous'},{id:'filter',lab:'Filtre',ph:'ex. date = demain'}];
  S(FLOW({title:t,nodes:[sch,ND.db],dialog:DLG('Supabase',fd,360)}),'filter','saisie','Dans [[Filtre]], tapez [[date = demain]].','Seuls les rendez-vous du lendemain reçoivent un rappel.','date = demain');
  S(FLOW({title:t,nodes:[sch,db],dialog:DLG('Supabase',[fd[0],fd[1],{...fd[2],value:'date = demain'}],360)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[sch,db]}),'add-next','clic','Dernière étape : [[+]].','');
  S(FLOW({title:t,nodes:[sch,db],drawer:{res:[RES.was,RES.http,RES.wait]}}),'res-was','clic','Ajoutez [[WhatsApp · Envoyer]].','');
  const fw={id:'tpl',k:'select',lab:'Modèle de message',ph:'Choisir un modèle approuvé…'};
  S(FLOW({title:t,nodes:[sch,db,ND.was],dialog:DLG('WhatsApp · Envoyer',[fw],260)}),'tpl','clic','Ouvrez la liste [[Modèle de message]].','');
  S(FLOW({title:t,nodes:[sch,db,ND.was],dialog:DLG('WhatsApp · Envoyer',[{...fw,menu:[{id:'tpl-ok',label:'rappel_rdv (approuvé · catégorie utilitaire)'},{id:'tpl-x',label:'Texte libre'}]}],260)}),'tpl-ok','clic','Choisissez le modèle approuvé [[rappel_rdv]].','Le patient n’a pas écrit dans les 24 dernières heures : un modèle approuvé par Meta est obligatoire.');
  S(FLOW({title:t,nodes:[sch,db,was],dialog:DLG('WhatsApp · Envoyer',[{...fw,value:'rappel_rdv'}],260)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[sch,db,was]}),'save','clic','Cliquez sur [[Enregistrer]].','');
  S(FLOW({title:t,nodes:[sch,db,was],toast:'Workflow enregistré'}),'active','clic','Activez le workflow.','Chaque soir à 18 h, les patients du lendemain reçoivent leur rappel.');
});

L(8,3,'Leçon 8 — KYC par WhatsApp : protéger les pièces d’identité','Claude Code et mises en situation',S=>{
  const d='~/projets/kyc-microfinance';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Crée le stockage des pièces d’identité]].','Les pièces d’identité sont des données personnelles très sensibles.','Crée le stockage des pièces d’identité');
  S(CC({dir:d,lines:['> Crée le stockage des pièces d’identité'],perm:PERM('Claude souhaite créer le compartiment de stockage : pieces-identite (public)',['Chaque fichier serait accessible par simple lien'],2)}),'ok','clic','Un compartiment public ? Votre réponse ?','Répondez Non et demandez un compartiment privé, avec accès par rôle.');
  S(CC({dir:d,lines:['● Compris : compartiment privé, lecture réservée au rôle agent_kyc'],perm:PERM('Claude souhaite créer le compartiment de stockage : pieces-identite (privé)',['Accès : rôle agent_kyc uniquement · liens temporaires de 5 min'],0)}),'ok','clic','Cette fois, votre réponse ?','Privé + accès par rôle + liens temporaires : la bonne configuration.');
  Q(S,'KYC et données personnelles',[
    {q:'Claude extrait le nom, le numéro et la date de naissance de la pièce.\nQui valide l’ouverture du compte ?',o:['Claude, automatiquement','Un agent KYC humain, après contrôle'],ok:1,why:'L’IA prépare et contrôle la cohérence ; la décision reste humaine.'},
    {q:'Combien de temps garder les photos des pièces ?',o:['Pour toujours, au cas où','La durée fixée par la réglementation et le contrat, puis suppression'],ok:1,why:'On ne garde pas une donnée sensible plus longtemps que nécessaire.'},
    {q:'Un commercial demande l’accès à toutes les pièces d’identité.',o:['Je lui donne la clé service_role','Je refuse : seuls les agents KYC y ont accès'],ok:1,why:'Accès par rôle : chacun ne voit que ce dont il a besoin.'},
    {q:'Comment facturer ce service à la microfinance ?',o:['Par dossier vérifié','Par photo envoyée'],ok:0,why:'Le client paie pour un résultat : un dossier vérifié.'},
  ]);
});

L(9,3,'Leçon 9 — Recouvrement intelligent des factures','Mises en situation',S=>{
  const o=['J+1 : rappel WhatsApp courtois','J+7 : e-mail avec la facture','J+15 : appel par une personne','Mise en demeure envoyée par l’IA seule'];
  Q(S,'Relances progressives',[
    {q:'Une facture est échue depuis 1 jour. Première action ?',o,ok:0,why:'On commence doucement, par le canal le plus direct.'},
    {q:'Toujours impayée après une semaine.',o,ok:1,why:'L’e-mail joint la facture et garde une trace écrite.'},
    {q:'Toujours rien après 15 jours, malgré deux relances.',o,ok:2,why:'Un échange humain débloque souvent la situation.'},
    {q:'Quelle action ne doit jamais partir sans validation humaine ?',o,ok:3,why:'Un acte juridique engage l’entreprise : Claude rédige le brouillon, un humain décide.'},
    {q:'Le client répond : « Je paierai vendredi. »',o:['On ignore, les relances continuent','On enregistre la promesse dans Supabase et on suspend les relances jusqu’à vendredi'],ok:1,why:'Le suivi des promesses de paiement est la valeur ajoutée du service.'},
    {q:'Quel modèle de prix ?',o:['Abonnement, ou pourcentage des sommes récupérées','Un prix par message envoyé uniquement'],ok:0,why:'Le pourcentage aligne votre revenu sur le résultat du client.'},
  ]);
});

/* ========================= MODULE 4 — SaaS n° 5, 6, 7 : Vidéo et contenu IA ========================= */
L(10,4,'Leçon 10 — L’usine à pubs vidéo','Workflows (type n8n), simulé',S=>{
  const t='Usine à pubs — Boutique Élégance';
  const ns=[ND.wh,{...ND.ai,sub:'script 15 s'},ND.vid];
  S(FLOW({title:t,nodes:ns}),'n-ai','clic','Ouvrez le nœud [[Agent IA (Claude)]].','Claude écrit le script à partir de la photo et de la fiche produit.');
  const fa=[{id:'model',k:'select',lab:'Modèle',value:'claude-sonnet-5-5'},{id:'sys',lab:'Consigne',h:60,ph:'Décrivez le script attendu…'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('Agent IA (Claude)',fa,300)}),'sys','saisie','Tapez la consigne : [[Script de 15 secondes : accroche, produit, appel à l’action]].','Format court et structuré : c’est ce qui fonctionne sur les réseaux.','Script de 15 secondes : accroche, produit, appel à l’action');
  S(FLOW({title:t,nodes:ns,dialog:DLG('Agent IA (Claude)',[fa[0],{...fa[1],value:'Script de 15 secondes : accroche, produit, appel à l’action'}],300)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns}),'n-vid','clic','Ouvrez le nœud [[Générateur vidéo]].','Ce nœud appelle l’API du service de génération vidéo.');
  const fv=[{id:'cred',lab:'Identifiant',value:'Clé API Higgsfield (rangée dans les identifiants)'},{id:'fmt',k:'select',lab:'Format',value:'Vertical 9:16 · 15 s'},{id:'credits',lab:'Coût par vidéo',value:'Crédits : à vérifier sur la grille du fournisseur'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('Générateur vidéo',fv,360)}),'credits','clic','Repérez le [[coût par vidéo]].','Chaque génération consomme des crédits payants : votre pack client doit couvrir ce coût plus votre marge.');
  S(FLOW({title:t,nodes:ns,dialog:DLG('Générateur vidéo',fv,360)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns}),'add-next','clic','Ajoutez une dernière étape : [[+]].','');
  S(FLOW({title:t,nodes:ns,drawer:{res:[RES.wait,RES.was,RES.http]}}),'res-wait','clic','Ajoutez [[Attendre une validation]].','Le client approuve la vidéo avant toute publication.');
  S(FLOW({title:t,nodes:[...ns,ND.ok]}),'save','clic','Cliquez sur [[Enregistrer]].','');
  Q(S,'Vendre des vidéos IA',[
    {q:'Le client fournit la photo d’un produit d’une autre marque.',o:['On génère quand même','On vérifie les droits sur les images et les marques avant de générer'],ok:1,why:'Vous êtes responsable de ce que vous produisez pour le client.'},
    {q:'Quel modèle de prix ?',o:['Packs de crédits (ex. 10 vidéos par mois)','Vidéos illimitées pour un petit prix fixe'],ok:0,why:'« Illimité » = risque de perte : chaque vidéo vous coûte des crédits.'},
  ]);
});

L(11,4,'Leçon 11 — Studio de packshots 3D avec Blender','Claude Code et terminal',S=>{
  const d='~/projets/packshots';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Écris un script Blender qui rend produit.glb sous 3 angles]].','Claude Code écrit le script Python (bpy) ; Blender fait le rendu.','Écris un script Blender qui rend produit.glb sous 3 angles');
  S(CC({dir:d,lines:['> Écris un script Blender qui rend produit.glb sous 3 angles'],perm:PERM('Claude souhaite créer : scripts/rendu_packshot.py',['Script Python pour Blender : fond blanc, 3 caméras, éclairage studio'],0)}),'ok','clic','Nouveau script, prévu par la demande : votre réponse ?','');
  S(CC({dir:d,lines:['✔ scripts/rendu_packshot.py créé','  import bpy, sys','  modele = sys.argv[-1]          # chemin du fichier .glb','  for angle in (0, 45, 90): …     # une caméra par angle',{id:'l-out',t:'  sortie : rendus/<produit>_<angle>.png (1080 × 1080)'}]}),'l-out','clic','Repérez où sont enregistrés les [[rendus]].','Des noms prévisibles permettent d’automatiser la livraison au client.');
  S(SHELL(['$ ls','produit.glb  scripts/  rendus/'],'dev@saas : '+d),'term-in','saisie','Lancez le rendu sans interface : [[blender -b -P scripts/rendu_packshot.py -- produit.glb]].','-b : sans interface (serveur). -P : exécute le script. Ce qui suit -- est transmis au script.','blender -b -P scripts/rendu_packshot.py -- produit.glb');
  S(SHELL(['$ blender -b -P scripts/rendu_packshot.py -- produit.glb','✔ rendus/produit_0.png','✔ rendus/produit_45.png','✔ rendus/produit_90.png','$ git add scripts/'],'dev@saas : '+d),'term-in','saisie','Enregistrez le script : [[git commit -m "Script de packshots 3 angles"]].','Le script est votre machine à produire : il se versionne.','git commit -m "Script de packshots 3 angles"');
  Q(S,'Packshots et licences',[
    {q:'Un client envoie un modèle 3D téléchargé sur Internet.',o:['Je le rends tel quel','Je vérifie la licence du modèle avant de vendre les rendus'],ok:1,why:'Certains modèles gratuits interdisent l’usage commercial.'},
    {q:'Blender est-il payant pour un usage commercial ?',o:['Oui, une licence par poste','Non : Blender est libre et gratuit, y compris pour vendre des rendus'],ok:1,why:'Blender est sous licence libre (GPL) : aucun coût de licence.'},
  ]);
});

L(12,4,'Leçon 12 — Community manager automatisé','Mises en situation',S=>{
  Q(S,'Publier pour une marque',[
    {q:'Claude a préparé 12 publications pour le mois.\nQui décide de les publier ?',o:['n8n publie tout automatiquement','Le client valide chaque publication, puis n8n la programme'],ok:1,why:'Jamais de diffusion sans validation : la marque engage sa réputation.'},
    {q:'Comment publier sur les réseaux sociaux du client ?',o:['Avec le mot de passe du client','Avec les API officielles et un accès que le client autorise'],ok:1,why:'Pas de partage de mot de passe : accès délégué, révocable.'},
    {q:'Où ranger le calendrier éditorial et les statuts\n(brouillon, validé, publié) ?',o:['Dans une table Supabase','Dans la mémoire de Claude'],ok:0,why:'Claude n’a pas de mémoire entre deux exécutions : l’état vit dans la base.'},
    {q:'Une publication cite un chiffre de vente inventé.',o:['On publie, personne ne vérifiera','On corrige : aucun chiffre qui ne vient pas du client'],ok:1,why:'L’IA peut inventer : toute donnée chiffrée vient d’une source.'},
    {q:'Quel modèle de prix ?',o:['Abonnement mensuel par marque','Paiement unique'],ok:0,why:'Le contenu se renouvelle chaque mois : revenu récurrent.'},
  ]);
});

/* ========================= MODULE 5 — SaaS n° 8 à 11 : 3D temps réel ========================= */
L(13,5,'Leçon 13 — Configurateur 3D : couleurs, options et devis','Claude Code',S=>{
  const d='~/projets/configurateur-cuisine';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Crée un configurateur Three.js pour cuisine.glb]].','Three.js affiche la 3D directement dans le navigateur, même sur téléphone.','Crée un configurateur Three.js pour cuisine.glb');
  S(CC({dir:d,lines:['> Crée un configurateur Three.js pour cuisine.glb','● Plan : page web, chargement du modèle, boutons de couleurs des façades'],perm:PERM('Claude souhaite créer : index.html et src/configurateur.js',['2 nouveaux fichiers'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d,lines:['✔ Configurateur créé : 4 couleurs de façades, 3 plans de travail']}),'cc-in','saisie','Ajoutez le devis : [[Calcule le devis depuis la table options de Supabase]].','Les prix vivent dans la base : le client les modifie sans toucher au code.','Calcule le devis depuis la table options de Supabase');
  S(CC({dir:d,lines:['> Calcule le devis depuis la table options de Supabase','● Plan :','  1. Lecture des options et des prix (lecture publique, RLS)',{id:'l-price',t:'  2. Total recalculé côté serveur (fonction Supabase), pas seulement dans le navigateur'},'  3. Enregistrement du devis et envoi par e-mail au vendeur']}),'l-price','clic','Repérez où le [[total]] est calculé.','Un prix calculé seulement dans le navigateur peut être modifié par n’importe quel visiteur.');
  Q(S,'Mettre le configurateur en ligne',[
    {q:'Le modèle cuisine.glb pèse 180 Mo.',o:['On le met en ligne tel quel','On l’optimise dans Blender (moins de polygones, textures compressées)'],ok:1,why:'Sur un téléphone, au-delà de quelques Mo, le client abandonne.'},
    {q:'Où héberger la page ?',o:['Offre gratuite type Vercel ou Netlify, avec Supabase','Un serveur GPU loué au mois'],ok:0,why:'Three.js tourne sur l’appareil du client : pas besoin de GPU serveur.'},
    {q:'Quel modèle de prix ?',o:['Licence annuelle par client','Une seule facture, maintenance offerte à vie'],ok:0,why:'Licence annuelle : hébergement, mises à jour et nouveaux produits inclus.'},
  ]);
});

L(14,5,'Leçon 14 — Choisir la bonne technologie 3D','Mises en situation',S=>{
  const o=['Three.js (web léger)','Unreal Engine + Pixel Streaming','Pipeline Blender automatisé'];
  Q(S,'La bonne techno pour le bon client',[
    {q:'Visite virtuelle d’un appartement pour une petite agence,\nà regarder sur téléphone.',o,ok:0,why:'Version web légère : peu coûteuse, visible partout.'},
    {q:'Visite premium photoréaliste pour un grand promoteur,\nsur grand écran.',o,ok:1,why:'Pixel Streaming exige des serveurs GPU : à facturer dans l’hébergement mensuel.'},
    {q:'Simulateur de conduite d’engin pour une mine,\navec scores et certificats.',o,ok:1,why:'Unreal pour la simulation, Supabase pour les scores et les certificats.'},
    {q:'Préparer 500 assets de jeu (niveaux de détail, export).',o,ok:2,why:'Des scripts Blender écrits avec Claude Code traitent les fichiers en série.'},
    {q:'Avant de vendre un projet Unreal à un client, que vérifier ?',o:['Rien, Unreal est gratuit','Les conditions de la licence Unreal Engine pour cet usage'],ok:1,why:'Les conditions dépendent de l’usage (jeu vendu, projet client) : lisez-les le jour J.'},
    {q:'Par où commencer avec un petit budget ?',o:['Les visites Unreal premium','Les SaaS WhatsApp et web, puis la 3D en phase 2'],ok:1,why:'La 3D rapporte plus par client, mais demande plus de temps et parfois des GPU coûteux.'},
  ]);
});

/* ========================= MODULE 6 — SaaS n° 12, 13, 14 : Développement, MCP et GitHub ========================= */
L(15,6,'Leçon 15 — Connecteur MCP sur mesure pour un client','Terminal et Claude Code',S=>{
  const t0=['$ # Serveur MCP de test, installé chez le client (lecture seule)'];
  S(SHELL(t0),'term-in','saisie','Branchez le connecteur : [[claude mcp add --transport http erp https://erp-test.example/mcp]].','MCP est une prise standard : Claude peut alors interroger l’ERP du client.','claude mcp add --transport http erp https://erp-test.example/mcp');
  const t1=[...t0,'$ claude mcp add --transport http erp https://erp-test.example/mcp','✔ Connecteur « erp » ajouté'];
  S(SHELL(t1),'term-in','saisie','Vérifiez : [[claude mcp list]].','','claude mcp list');
  S(SHELL([...t1,'$ claude mcp list','erp: https://erp-test.example/mcp (HTTP) - ✔ connecté']),'term-in','saisie','Ouvrez une session : [[claude]].','','claude');
  S(CC({}),'cc-in','saisie','Posez une question métier : [[Quel est le stock du produit A-102 ?]]','Les équipes du client interrogent leurs propres données en langage courant.','Quel est le stock du produit A-102 ?');
  S(CC({lines:['> Quel est le stock du produit A-102 ?'],perm:PERM('Claude souhaite utiliser : erp · lire_stock',['Lecture seule · base de test'],0)}),'ok','clic','Lecture seule sur la base de test : votre réponse ?','');
  S(CC({lines:['✔ A-102 : 48 unités (dépôt Limete)','> Mets le stock à zéro'],perm:PERM('Claude souhaite utiliser : erp · modifier_stock',['Écriture dans l’ERP du client'],2)}),'ok','clic','Claude veut écrire dans l’ERP. Votre réponse ?','Le connecteur livré commence en lecture seule ; l’écriture se décide avec le client, outil par outil.');
  Q(S,'Livrer un connecteur MCP',[
    {q:'Où tourne le serveur MCP du client ?',o:['Sur son infrastructure ou un hébergement qu’il contrôle, avec ses identifiants','Sur votre ordinateur personnel, avec ses mots de passe'],ok:0,why:'Les données restent chez le client ; vous n’avez pas ses mots de passe.'},
    {q:'Quel modèle de prix ?',o:['Frais d’installation + maintenance mensuelle','Gratuit, pour se faire connaître'],ok:0,why:'L’installation paie le travail ; la maintenance paie le suivi.'},
  ]);
});

L(16,6,'Leçon 16 — Revue de code automatique avec GitHub Actions','Claude Code et forge de code',S=>{
  const d='~/projets/client-boutique';
  S(CC({dir:d}),'cc-in','saisie','Installez l’intégration GitHub : tapez [[/install-github-app]].','Cette commande installe l’application GitHub de Claude et prépare le workflow GitHub Actions.','/install-github-app');
  S(CC({dir:d,lines:['> /install-github-app','✔ Application installée sur le dépôt client-boutique'],perm:PERM('Claude souhaite créer : .github/workflows/claude.yml',['Workflow déclenché par les mentions @claude'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d+'/.github/workflows/claude.yml',noHead:true,lines:['name: Claude','on: [issue_comment, pull_request_review_comment]','jobs:','  claude:','    runs-on: ubuntu-latest','    steps:','      - uses: anthropics/claude-code-action@v1','        with:',{id:'l-secret',t:'          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}'}]}),'l-secret','clic','Repérez la ligne de la [[clé API]].','La clé est un secret du dépôt : elle n’est jamais écrite en clair.');
  const gh=(o={})=>APP({brand:'Forge de code — client-boutique',logo:'</>',color:'#24292f',side:[{id:'nav-code',label:'Code'},{id:'nav-pr',label:'Propositions (PR)',on:true},{id:'nav-act',label:'Actions'}],title:'Proposition n° 7 — Paiement Mobile Money',subtitle:'dev-junior veut fusionner 4 changements dans main',toast:o.toast,items:[
    I('tab','tab-conv',240,140,140,30,{label:'Conversation',on:true}), I('tab','tab-files',388,140,160,30,{label:'Fichiers modifiés'}),
    ...(o.answer?[I('box',null,240,190,730,150,{title:'claude (bot) a répondu'}),I('lines',null,256,244,700,0,{lines:['Revue : ajout du paiement Mobile Money et de sa page de confirmation.','⚠ Risque : la requête SQL de paiement.js assemble le numéro de téléphone','dans le texte (injection SQL possible). Utilisez une requête paramétrée.']})]:[]),
    I('field','comment',240,o.answer?360:200,730,70,{lab:'Ajouter un commentaire',value:o.c||'',ph:'Écrire un commentaire…'}),
    I('btn','send',850,o.answer?446:286,120,34,{label:'Commenter',primary:true}),
    I('btn','merge',240,o.answer?446:286,200,34,{label:'Fusionner la proposition',green:true})]});
  S(gh(),'comment','saisie','Demandez une revue : [[@claude relis cette proposition]].','Toute personne ayant les droits d’écriture peut mentionner @claude.','@claude relis cette proposition');
  S(gh({c:'@claude relis cette proposition'}),'send','clic','Cliquez sur [[Commenter]].','');
  S(gh({answer:1,toast:'Claude a répondu'}),'tab-files','clic','Claude signale un risque. Avant toute fusion, ouvrez [[Fichiers modifiés]].','Claude signale ; le développeur corrige ; un humain approuve la fusion.');
  Q(S,'Vendre la revue de code',[{q:'Quel modèle de prix ?',o:['Abonnement par dépôt','Paiement par ligne de code'],ok:0,why:'Simple à comprendre et prévisible pour le client.'}]);
});

L(17,6,'Leçon 17 — Fabrique d’applications internes : livrer un back-office','Claude Code et terminal',S=>{
  const d='~/projets/stock-quincaillerie';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Le client a décrit son besoin. Passez en [[mode plan]].','On comprend et on planifie avant d’écrire une ligne.');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Crée un back-office de gestion de stock avec Supabase]].','','Crée un back-office de gestion de stock avec Supabase');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:['> Crée un back-office de gestion de stock avec Supabase','● Plan proposé :','  1. Tables : articles, mouvements, fournisseurs','  2. Écrans : liste du stock, entrée/sortie, alertes de rupture',{id:'l-auth',t:'  3. Connexion : comptes gérant et vendeur, droits différents (RLS)'},'  4. Tests, puis déploiement sur une offre gratuite']}),'l-auth','clic','Repérez la gestion des [[comptes et droits]].','Le vendeur enregistre les sorties ; seul le gérant modifie les prix.');
  S(CC({dir:d}),'cc-in','saisie','Plan validé. Tapez [[Exécute le plan]].','','Exécute le plan');
  S(CC({dir:d,lines:['> Exécute le plan'],perm:PERM('Claude souhaite créer 14 fichiers (app/, supabase/migrations/, tests/)',['Nouveaux fichiers dans le projet'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d,lines:['✔ 14 fichiers créés',{id:'l-tests',t:'✔ Tests : 12 réussis · 0 échec'}]}),'l-tests','clic','Vérifiez le résultat des [[tests]].','Pas de livraison sans tests verts.');
  S(CC({dir:d,lines:['✔ Tests verts']}),'cc-in','saisie','Enregistrez : [[Enregistre une version]].','','Enregistre une version');
  S(CC({dir:d,lines:['> Enregistre une version'],perm:PERM('Claude souhaite exécuter : git commit -m "Back-office stock v1 : articles, mouvements, rôles"',[],0)}),'ok','clic','Validez.','');
  Q(S,'Livrer au client',[
    {q:'Où héberger le back-office pour démarrer ?',o:['Offre gratuite Vercel ou Netlify, base Supabase','Un serveur acheté pour l’occasion'],ok:0,why:'Coût de départ nul ; on passe à une offre payante si l’usage grandit.'},
    {q:'Qui possède le code à la fin du projet ?',o:['Le contrat le précise : en général le client, avec un abonnement de maintenance','Personne, c’est l’IA qui l’a écrit'],ok:0,why:'Écrivez-le dans le contrat. Vous facturez la valeur métier et la maintenance.'},
  ]);
});

/* ========================= MODULE 7 — SaaS n° 15, 16, 17 : Pilotage, conformité et formation ========================= */
L(18,7,'Leçon 18 — Le résumé hebdomadaire du gérant sur WhatsApp','Workflows (type n8n) et messagerie, simulés',S=>{
  const t='Résumé du lundi — Quincaillerie Bon Prix';
  const ns=[{...ND.sch,sub:'à régler'},{...ND.db,sub:'ventes et stocks'},{...ND.ai,sub:'résumé + alertes'},{...ND.was,sub:'au gérant'}];
  S(FLOW({title:t,nodes:ns}),'n-sch','clic','Ouvrez le déclencheur [[Schedule Trigger]].','');
  const f=[{id:'freq',k:'select',lab:'Déclencher',ph:'Choisir…'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('Schedule Trigger',[{...f[0],menu:[{id:'f-week',label:'Chaque semaine'},{id:'f-hour',label:'Chaque heure'}]}])}),'f-week','clic','Choisissez [[Chaque semaine]].','');
  const f2=[{...f[0],value:'Chaque semaine'},{id:'day',k:'select',lab:'Jour',value:'Lundi'},{id:'hour',lab:'Heure',ph:'ex. 07:00'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('Schedule Trigger',f2,360)}),'hour','saisie','Tapez l’heure : [[07:00]].','Le gérant lit son résumé avant d’ouvrir la boutique.','07:00');
  const ns2=[{...ns[0],sub:'lundi 07:00'},...ns.slice(1)];
  S(FLOW({title:t,nodes:ns2,dialog:DLG('Schedule Trigger',[f2[0],f2[1],{...f2[2],value:'07:00'}],360)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns2}),'n-ai','clic','Ouvrez le nœud [[Agent IA (Claude)]].','');
  const fa={id:'sys',lab:'Consigne',h:60,ph:'Décrivez le résumé attendu…'};
  S(FLOW({title:t,nodes:ns2,dialog:DLG('Agent IA (Claude)',[fa],260)}),'sys','saisie','Tapez : [[Résume la semaine en 5 lignes et signale les ruptures]].','Les chiffres viennent de Supabase ; Claude les met en forme et repère les alertes.','Résume la semaine en 5 lignes et signale les ruptures');
  S(FLOW({title:t,nodes:ns2,dialog:DLG('Agent IA (Claude)',[{...fa,value:'Résume la semaine en 5 lignes et signale les ruptures'}],260)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns2}),'test','clic','Cliquez sur [[Tester le flux]].','On teste avant d’activer : le message part vers le numéro de test.');
  S(WA({title:'Gérant (numéro de test)',subtitle:'Lundi 07:00',side:[{id:'c-1',label:'Résumés automatiques',on:true}],msgs:[{t:'Semaine 45 : ventes 2 340 000 CDF (+8 %)\nMeilleure vente : tôles bac 3 m\nPanier moyen : 38 500 CDF',time:'07:00'},{id:'m-alert',t:'⚠ Rupture : ciment 50 kg (0 en stock)\n⚠ Stock faible : peinture blanche 20 L (3)',time:'07:00'}]}),'m-alert','clic','Le résumé est arrivé. Repérez les [[alertes de stock]].','C’est la valeur du service : le gérant agit dès lundi matin.');
  Q(S,'Fiabilité du résumé',[{q:'Le résumé annonce +80 % au lieu de +8 %.',o:['On laisse, le gérant comprendra','On vérifie le calcul dans la requête Supabase : Claude met en forme, il ne calcule pas'],ok:1,why:'Les calculs se font dans la base ; on demande à Claude de recopier, pas d’estimer.'}]);
});

L(19,7,'Leçon 19 — Veille de conformité et échéances','Claude Code et mises en situation',S=>{
  const d='~/clients/transport-express';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Liste les échéances des contrats du dossier Contrats]].','Claude lit les contrats et extrait les dates clés.','Liste les échéances des contrats du dossier Contrats');
  S(CC({dir:d,lines:['> Liste les échéances des contrats du dossier Contrats','● Lecture de 9 contrats…','  Licence de transport : expire le 30/11 (J-23)','  Assurance flotte : renouvellement le 15/01',{id:'l-risk',t:'⚠ Clause 12 (contrat_assurance.pdf) : résiliation sans préavis par l’assureur'},'  Déclaration fiscale trimestrielle : 15/01']}),'l-risk','clic','Repérez la [[clause à risque]].','L’outil signale ; il ne remplace pas un juriste.');
  Q(S,'Conformité',[
    {q:'Claude signale une clause à risque.',o:['On modifie le contrat nous-mêmes','On alerte le client et on lui conseille de consulter un juriste'],ok:1,why:'Vous vendez un outil de veille, pas du conseil juridique.'},
    {q:'Quand prévenir que la licence expire le 30 ?',o:['Le 30','À J-30, J-7 et J-1, par WhatsApp et e-mail'],ok:1,why:'Plusieurs alertes, sur deux canaux : personne ne rate l’échéance.'},
    {q:'Les contrats du client sont…',o:['Publics','Confidentiels : accès par rôle, jamais réutilisés pour un autre client'],ok:1,why:'Chaque client a son espace, isolé par la RLS.'},
  ]);
});

L(20,7,'Leçon 20 — Académie tech : créer vos propres simulateurs','Mises en situation',S=>{
  Q(S,'Utiliser ce simulateur comme produit',[
    {q:'Vous voulez une leçon sur le logiciel d’un client.\nPar où commencer ?',o:['Onglet « Cartographier » : ajouter des captures d’écran','Écrire tout le code d’un nouveau simulateur'],ok:0,why:'Le contenu est réutilisable à l’infini : une capture par écran, une étape par geste.'},
    {q:'Comment indiquer où l’apprenant doit cliquer ?',o:['En traçant une rubrique sur la capture','En décrivant la position en mots'],ok:0,why:'La rubrique est enregistrée en pourcentage : elle reste juste sur tous les écrans.'},
    {q:'Une étape demande de taper une commande. Que renseigner ?',o:['L’action « Taper un texte » et le texte attendu','Rien de plus'],ok:0,why:'La frappe est contrôlée caractère par caractère.'},
    {q:'Quel niveau donne droit au certificat ?',o:['Le mode Évaluation avec au moins 80 / 100','Le mode Démonstration'],ok:0,why:'L’évaluation se fait sans flèche : c’est la preuve de maîtrise.'},
    {q:'Quel modèle de prix pour l’académie ?',o:['Abonnement apprenant + licences pour écoles et entreprises','Vente unique d’une vidéo'],ok:0,why:'Revenu récurrent, et ventes groupées aux organisations.'},
  ]);
});

/* ========================= MODULE 8 — Lancer et vendre ========================= */
L(21,8,'Leçon 21 — Business model, prix et validation','Mises en situation',S=>{
  Q(S,'Lancer son SaaS',[
    {q:'Avant d’écrire la première ligne de code…',o:['Je code pendant trois mois','Je vends 3 à 5 pré-commandes à de vrais clients'],ok:1,why:'« Rentable » n’est jamais garanti : la pré-commande prouve la demande.'},
    {q:'Quel SaaS lancer en premier avec un petit budget ?',o:['Le vendeur WhatsApp (n° 1)','Les visites virtuelles Unreal (n° 8)'],ok:0,why:'Besoin immédiat, démonstration facile, outils gratuits au départ.'},
    {q:'n8n auto-hébergé : que permet sa licence ?',o:['Faire tourner VOTRE SaaS','Revendre n8n lui-même comme service hébergé à vos clients'],ok:0,why:'La licence interdit de revendre n8n lui-même comme service hébergé.'},
    {q:'Meta facture certaines conversations WhatsApp. Que faire ?',o:['Les ignorer','Les intégrer au prix de l’abonnement, ou les refacturer'],ok:1,why:'Sinon, chaque nouveau client vous coûte de l’argent.'},
    {q:'Votre 3ᵉ SaaS réutilise les briques du premier. Lequel ?',o:['Tableau de bord + résumé WhatsApp (n° 15)','Studio de packshots 3D (n° 6)'],ok:0,why:'Même numéro WhatsApp, même base Supabase, mêmes workflows : revenu récurrent rapide.'},
  ]);
});

L(22,8,'Leçon 22 — Épreuve Moyen (à faire en mode Évaluation)','Mises en situation',S=>{
  Q(S,'Épreuve Moyen',[
    {q:'La clé secrète service_role est dans le code de la page web.',o:['Ce n’est pas grave','Je la révoque, j’en crée une nouvelle et je la range côté serveur'],ok:1,why:'Une clé exposée est compromise : on la révoque.'},
    {q:'Une table clients a la RLS désactivée.',o:['Je l’active et j’écris les règles d’accès','Je laisse, l’app est encore petite'],ok:0,why:'Sans RLS, la clé publique lit toutes les lignes.'},
    {q:'Un client veut brancher son WhatsApp personnel\navec un outil non officiel.',o:['J’accepte, c’est plus rapide','Je refuse : uniquement l’API officielle WhatsApp Business'],ok:1,why:'Outil non officiel = risque de blocage du numéro et de fuite.'},
    {q:'Claude veut appliquer une migration sur la base de production.',o:['Oui','Non : d’abord la base de test, puis relecture'],ok:1,why:'On teste avant la production.'},
    {q:'L’IA propose d’envoyer seule une mise en demeure.',o:['Je laisse faire','Claude rédige le brouillon, un humain décide'],ok:1,why:'Acte juridique = décision humaine.'},
    {q:'Les pièces d’identité KYC sont stockées…',o:['dans un compartiment public','dans un compartiment privé, accès par rôle'],ok:1,why:'Donnée très sensible : privé et rôles.'},
    {q:'Vous avez une idée de SaaS. Première étape ?',o:['Vendre 3 à 5 pré-commandes','Coder la version complète'],ok:0,why:'On valide la demande avant de développer.'},
  ]);
});

return out;
})();
