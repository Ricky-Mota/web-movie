
/* ========================= Leçons approfondies : SaaS n° 1, 14 et 15 ========================= */
RES.iff = {id:'res-if', label:'If', desc:'Sépare en deux branches : vrai / faux', c:'#0e7490', ico:'?'};
const VCL = (o={}) => APP({brand:'Hébergement (type Vercel)',logo:'▲',color:'#111827',
  side:[{id:'nav-proj',label:'Projets',on:o.nav==='proj'},{id:'nav-dep',label:'Déploiements',on:o.nav==='dep'},{id:'nav-dom',label:'Domaines',on:o.nav==='dom'},{id:'nav-set',label:'Paramètres',on:o.nav==='set'}],
  title:o.title, subtitle:o.subtitle, items:o.items||[], dialog:o.dialog, toast:o.toast});
const DASH = (o={}) => APP({brand:'Tableau de bord PME',logo:'▦',color:'#1f4fa3',
  side:[{id:'nav-home',label:'Vue d’ensemble',on:o.nav==='home'},{id:'nav-stock',label:'Stock',on:o.nav==='stock'},{id:'nav-alertes',label:'Alertes',on:o.nav==='alertes'}],
  title:o.title||'Quincaillerie Bon Prix', subtitle:o.subtitle||'Semaine 45 · données de démonstration', items:o.items||[], dialog:o.dialog, toast:o.toast});
const TILE = (id,x,label,val,warn) => [I('box',id,x,140,170,90,{fill:warn?'#fff4e0':'#fff',stroke:warn?'#d97706':'#d9dfe8'}), I('text',null,x+14,168,0,0,{label,size:12,fill:'#5b6880'}), I('text',null,x+14,208,0,0,{label:val,size:24,wt:700,fill:warn?'#b45309':'#14213a'})];
const BARS = I('raw',null,0,0,0,0,{svg:[42,55,48,61,58,66,72].map((v,i)=>`<rect x="${270+i*96}" y="${520-v*3.4}" width="56" height="${v*3.4}" rx="4" fill="#1f4fa3" opacity="${i===6?1:.55}"/><text x="${298+i*96}" y="540" font-size="11" fill="#5b6880" text-anchor="middle">S${39+i}</text>`).join('')});
const HOME = (o={}) => DASH({nav:'home',toast:o.toast,items:[...TILE('k-ca',240,'Chiffre d’affaires','2,34 M CDF'),...TILE('k-cmd',425,'Commandes','61'),...TILE('k-pan',610,'Panier moyen','38 500 CDF'),...TILE('k-rupt',795,'Ruptures','2',true),
  I('box',null,240,250,730,310,{title:'Ventes par semaine (en centaines de milliers de CDF)'}),BARS]});

/* ---------- SaaS n° 1 : paiement Mobile Money ---------- */
L(23,2,'Leçon 23 — Encaisser par Mobile Money avec pawaPay','Workflows (type n8n) et messagerie, simulés',S=>{
  const t='Paiement — Boutique Mama Ngozi';
  const db={...ND.db,sub:'commande + depositId'}, http={id:'n-http',label:'Dépôt pawaPay',sub:'sandbox',c:'#1f4fa3',ico:'API'};
  S(FLOW({title:t,nodes:[db]}),'add-next','clic','La commande est enregistrée avec un identifiant de dépôt. Ajoutez l’étape suivante : [[+]].','L’agrégateur pawaPay couvre en RDC Vodacom M-Pesa, Airtel Money et Orange Money, en CDF et en USD selon l’opérateur.');
  S(FLOW({title:t,nodes:[db],drawer:{res:[RES.http,RES.was,RES.wait]}}),'res-http','clic','Ajoutez [[HTTP Request]].','Une seule API pour les trois opérateurs.');
  const fh=[{id:'method',k:'select',lab:'Méthode',value:'POST'},{id:'url',lab:'URL',value:'https://api.sandbox.pawapay.io/v2/deposits',mono:true},
    {id:'body',lab:'Corps (JSON)',h:100,mono:true,value:'{ "depositId": "{{ $json.deposit_id }}",\n  "amount": "{{ $json.total }}", "currency": "CDF",\n  "payer": { "type": "MMO", "accountDetails": {\n    "phoneNumber": "{{ $json.tel }}",\n    "provider": "ORANGE_COD" } } }'},
    {id:'cred',lab:'Identifiant',value:'Jeton API pawaPay (sandbox)'}];
  S(FLOW({title:t,nodes:[db,http],dialog:DLG('HTTP Request',fh,440)}),'url','clic','Vérifiez l’[[URL]] : c’est le bac à sable (sandbox) de pawaPay.','En sandbox, aucun vrai compte n’est débité, et des numéros de test RDC simulent chaque résultat.');
  S(FLOW({title:t,nodes:[db,http],dialog:DLG('HTTP Request',fh,440)}),'body','clic','Repérez le [[depositId]] dans le corps.','Identifiant unique (UUID), enregistré dans Supabase AVANT l’appel. Renvoyé deux fois, la demande est ignorée (DUPLICATE_IGNORED) : pas de double débit.');
  S(FLOW({title:t,nodes:[db,http],dialog:DLG('HTTP Request',fh,440)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[db,http]}),'add-next','clic','Ajoutez une étape : [[+]].','');
  S(FLOW({title:t,nodes:[db,http],drawer:{res:[RES.was,RES.wait,RES.iff]}}),'res-was','clic','Ajoutez [[WhatsApp · Envoyer]].','Le client est prévenu qu’il doit valider le paiement sur son téléphone, avec son code PIN.');
  const all=[db,http,{...ND.was,sub:'« validez avec votre PIN »'}];
  S(FLOW({title:t,nodes:all}),'save','clic','Enregistrez ce premier workflow.','');
  Q(S,'Lire la réponse de pawaPay',[
    {q:'Le client paie avec M-Pesa. Quel « provider » envoyer ?',o:['ORANGE_COD','VODACOM_MPESA_COD','AIRTEL_COD'],ok:1,why:'Le code dépend de l’opérateur du client. Vérifiez aussi la devise acceptée par chaque opérateur dans la liste des fournisseurs de pawaPay.'},
    {q:'La réponse immédiate est ACCEPTED. La commande est-elle payée ?',o:['Oui','Non : ACCEPTED veut dire « en cours ». Seul le rappel final COMPLETED confirme le paiement'],ok:1,why:'Le client n’a peut-être pas encore tapé son PIN. REJECTED, lui, signifie que la demande a été refusée (avec une raison).'},
  ]);
  const t2='Confirmation de paiement';
  S(FLOW({title:t2}),'add-first','clic','Créez le second workflow, qui reçoit le rappel de pawaPay : [[+]].','C’est pawaPay, et non le client, qui confirme le paiement.');
  S(FLOW({title:t2,drawer:{res:[RES.wh,RES.wa,RES.sch]}}),'res-wh','clic','Choisissez [[Webhook]].','pawaPay appelle cette adresse quand le dépôt atteint un statut final.');
  const fw=[{id:'path',lab:'Chemin',ph:'ex. pawapay-depot',mono:true},{id:'auth',k:'select',lab:'Authentification',value:'Signature pawaPay vérifiée (RFC 9421)'}];
  const wh={id:'n-wh',label:'Webhook',sub:'rappel pawaPay',c:'#7b3fa0',ico:'⇣'};
  S(FLOW({title:t2,nodes:[wh],dialog:DLG('Webhook',fw)}),'path','saisie','Dans [[Chemin]], tapez [[pawapay-depot]].','Vous déclarerez ensuite cette adresse dans le tableau de bord pawaPay.','pawapay-depot');
  S(FLOW({title:t2,nodes:[wh],dialog:DLG('Webhook',[{...fw[0],value:'pawapay-depot'},fw[1]])}),'auth','clic','Repérez l’[[Authentification]].','N’importe qui peut appeler une URL. Activez les rappels signés dans le tableau de bord pawaPay, puis vérifiez chaque signature (leçon 24).');
  S(FLOW({title:t2,nodes:[wh],dialog:DLG('Webhook',[{...fw[0],value:'pawapay-depot'},fw[1]])}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t2,nodes:[wh]}),'add-next','clic','Ajoutez une étape : [[+]].','');
  S(FLOW({title:t2,nodes:[wh],drawer:{res:[RES.iff,RES.db,RES.was]}}),'res-if','clic','Ajoutez une condition : [[If]].','On ne valide la commande que si le dépôt a réussi.');
  const fi=[{id:'v1',lab:'Valeur 1',value:'{{ $json.status }}',mono:true},{id:'op',k:'select',lab:'Opérateur',value:'est égal à'},{id:'v2',lab:'Valeur 2',ph:'statut attendu',mono:true}];
  const iff={id:'n-if',label:'If',sub:'status = COMPLETED',c:'#0e7490',ico:'?'};
  S(FLOW({title:t2,nodes:[wh,iff],dialog:DLG('If',fi,360)}),'v2','saisie','Dans [[Valeur 2]], tapez le statut final de réussite : [[COMPLETED]].','Les deux statuts finaux sont COMPLETED (payé) et FAILED (échec, avec une raison).','COMPLETED');
  S(FLOW({title:t2,nodes:[wh,iff],dialog:DLG('If',[fi[0],fi[1],{...fi[2],value:'COMPLETED'}],360)}),'close','clic','Fermez le panneau.','');
  const all2=[wh,iff,{...ND.db,sub:'commande payée'},{...ND.was,sub:'reçu au client'}];
  S(FLOW({title:t2,nodes:all2}),'active','clic','Les étapes Supabase et WhatsApp sont ajoutées. Activez le workflow.','Branche vraie : commande marquée payée, puis reçu WhatsApp. Branche fausse : message « paiement non abouti, réessayez ».');
  S(WA({title:'Test sur le numéro de test',subtitle:'Vous jouez le rôle du client',msgs:[{t:'Commande n° 1042 : 45 000 CDF.\nValidez le paiement sur votre téléphone (code PIN).',time:'10:04'},{id:'m-recu',t:'Paiement reçu ✔ 45 000 CDF · Réf. CMD-1042\nLivraison prévue demain à Gombe.',time:'10:05'}]}),'m-recu','clic','Repérez le [[reçu]] envoyé après le rappel COMPLETED.','Le reçu part seulement quand pawaPay a confirmé.');
  Q(S,'Encaisser sans se faire piéger',[
    {q:'Un client écrit « J’ai payé » avec une capture d’écran.',o:['On marque la commande payée','On attend le rappel COMPLETED de pawaPay avant de livrer'],ok:1,why:'Une capture d’écran se falsifie en une minute.'},
    {q:'Aucun rappel n’arrive pour un dépôt de plus d’une heure.',o:['On considère que c’est payé','On interroge l’endpoint « Check deposit status » de pawaPay'],ok:1,why:'Le rappel peut se perdre : on vérifie le statut, et pawaPay permet aussi de redemander le rappel.'},
    {q:'pawaPay prend des frais sur chaque paiement.',o:['On les ignore','On demande la grille de frais et on l’intègre au prix ou à l’abonnement'],ok:1,why:'Les tarifs ne sont pas publics : demandez-les à l’ouverture du compte marchand.'},
  ]);
});

L(24,2,'Leçon 24 — Sécuriser les rappels pawaPay (signature, doublons, montant)','Claude Code et terminal',S=>{
  const d='~/projets/vendeur-whatsapp';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Code sensible : passez en [[mode plan]].','On touche à l’argent des clients : plan d’abord.');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Crée une Edge Function qui vérifie les rappels pawaPay]].','Une Edge Function Supabase reçoit les rappels côté serveur.','Crée une Edge Function qui vérifie les rappels pawaPay');
  const plan=['> Crée une Edge Function qui vérifie les rappels pawaPay','● Plan proposé :','  1. supabase/functions/pawapay-depot/index.ts',
    {id:'l-sig',t:'  2. Signature RFC 9421 (Signature, Signature-Input) vérifiée avec la clé publique pawaPay ; sinon 401'},
    {id:'l-check',t:'  3. Statut reconfirmé auprès de pawaPay (Check deposit status) avant de marquer payé'},
    {id:'l-idem',t:'  4. Idempotence : depositId unique en base ; un rappel déjà traité répond 200 sans rien modifier'},
    {id:'l-amount',t:'  5. Montant et devise comparés à la commande ; écart → commande bloquée et alerte au gérant'},'  6. Tests automatiques avec les numéros de test RDC du sandbox'];
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-sig','clic','Repérez la vérification de [[signature]].','pawaPay signe ses rappels (norme RFC 9421, ECDSA) si vous activez cette option dans son tableau de bord. Les clés publiques s’obtiennent par son API.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-check','clic','Repérez la [[reconfirmation du statut]].','Double sécurité : le rappel déclenche, l’appel de vérification confirme.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-idem','clic','Repérez la règle d’[[idempotence]].','Un même rappel peut arriver plusieurs fois : il ne doit produire qu’un seul paiement.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-amount','clic','Repérez le contrôle du [[montant]].','On compare avec le total enregistré dans la base, jamais avec un chiffre envoyé par le client.');
  S(CC({dir:d}),'cc-in','saisie','Plan validé. Tapez [[Exécute le plan]].','','Exécute le plan');
  S(CC({dir:d,lines:['> Exécute le plan'],perm:PERM('Claude souhaite créer : supabase/functions/pawapay-depot/index.ts et index.test.ts',['2 nouveaux fichiers'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d,lines:['✔ Fonction et tests créés'],perm:PERM('Claude souhaite modifier : supabase/functions/.env.example',['Ajout de la ligne : PAWAPAY_API_TOKEN=eyJraWQiOi… (jeton réel)'],2)}),'ok','clic','Claude veut écrire le vrai jeton dans un fichier du dépôt. Votre réponse ?','Un secret réel n’entre dans aucun fichier versionné : l’exemple contient seulement PAWAPAY_API_TOKEN=.');
  S(SHELL(['$ # secrets.env est listé dans .gitignore'],'dev@saas : '+d),'term-in','saisie','Envoyez le secret au serveur : [[supabase secrets set --env-file ./secrets.env]].','Le jeton est stocké chez Supabase et lu par la fonction au moment de l’exécution.','supabase secrets set --env-file ./secrets.env');
  S(CC({dir:d,lines:['> Lance les tests de la fonction','✔ signature valide + statut confirmé COMPLETED → commande payée','✔ signature absente ou fausse → 401, rien modifié','✔ même depositId reçu 2 fois → traité une seule fois',{id:'l-422',t:'✔ montant différent de la commande → commande bloquée, alerte au gérant'},'✔ statut FAILED → message « paiement non abouti » au client']}),'l-422','clic','Repérez le test du [[montant différent]].','Les tests prouvent que chaque attaque connue est bloquée.');
  Q(S,'Réflexes d’expert',[
    {q:'Votre code rejette toutes les signatures, même celles du sandbox.',o:['On désactive la vérification pour avancer','On vérifie le format de signature ECDSA attendu par la bibliothèque (DER ou brut), avec un rappel du sandbox'],ok:1,why:'Un développeur a signalé ce piège avec WebCrypto. On ne désactive jamais la vérification.'},
    {q:'La base est indisponible quand le rappel arrive.',o:['Répondre 200 pour qu’il arrête','Répondre une erreur 5xx, puis reconfirmer le statut ; l’idempotence évite le doublon'],ok:1,why:'Répondre 200 sans avoir enregistré, c’est perdre un paiement.'},
    {q:'Vous passez à un agrégateur local, FlexPay, dont le rappel n’est pas signé.',o:['On croit le rappel','On relit le statut et le montant via son endpoint de vérification avant de valider'],ok:1,why:'Sans signature, la vérification par l’API est la seule protection.'},
  ]);
});

L(25,2,'Leçon 25 — Inscrire une nouvelle boutique cliente','Console base de données (simulée)',S=>{
  const tabs=[I('row',null,240,150,730,36,{head:true,cells:['Table','Lignes'],cw:[400,300]}),I('row','t-boutiques',240,186,730,40,{cells:['boutiques','12'],cw:[400,300]}),I('row','t-produits',240,226,730,40,{cells:['produits','480'],cw:[400,300]}),I('row',null,240,266,730,40,{cells:['commandes','1 041'],cw:[400,300]})];
  S(DBC({nav:'tables',items:tabs}),'t-boutiques','clic','Une pharmacie vient de signer. Ouvrez la table [[boutiques]].','Chaque client du SaaS est une ligne de cette table.');
  const bq=(o={})=>DBC({nav:'tables',title:'Table boutiques',toast:o.toast,dialog:o.dialog,items:[I('btn','add-row',830,80,140,34,{label:'Insérer une ligne',primary:true}),I('row',null,240,150,730,36,{head:true,cells:['Nom','WhatsApp','Abonnement'],cw:[300,220,200]}),I('row',null,240,186,730,40,{cells:['Boutique Mama Ngozi','+243 81 000 0001','Essentiel'],cw:[300,220,200]}),I('row',null,240,226,730,40,{cells:['Quincaillerie Bon Prix','+243 82 000 0002','Pro'],cw:[300,220,200]}),...(o.extra||[])]});
  S(bq(),'add-row','clic','Cliquez sur [[Insérer une ligne]].','');
  const f=[{id:'nom',lab:'Nom de la boutique',ph:'ex. Boutique…'},{id:'tel',lab:'Numéro WhatsApp Business',ph:'+243…',mono:true},{id:'plan',k:'select',lab:'Abonnement',value:'Essentiel'}];
  const D=(a,b)=>DLG('Nouvelle boutique',[{...f[0],value:a},{...f[1],value:b},f[2]],330,'Enregistrer');
  S(bq({dialog:D('','')}),'nom','saisie','Dans [[Nom]], tapez [[Pharmacie La Grâce]].','','Pharmacie La Grâce');
  S(bq({dialog:D('Pharmacie La Grâce','')}),'tel','saisie','Tapez son numéro WhatsApp Business : [[+243 970 000 111]].','Le numéro relie les messages reçus à la bonne boutique.','+243 970 000 111');
  S(bq({dialog:D('Pharmacie La Grâce','+243 970 000 111')}),'close','clic','Cliquez sur [[Enregistrer]].','');
  S(bq({toast:'Boutique ajoutée',extra:[I('row',null,240,266,730,40,{on:true,cells:['Pharmacie La Grâce','+243 970 000 111','Essentiel'],cw:[300,220,200]})]}),'nav-tables','clic','Revenez à l’[[Éditeur de tables]] pour importer son catalogue.','');
  S(DBC({nav:'tables',items:tabs}),'t-produits','clic','Ouvrez la table [[produits]].','');
  const pr=(o={})=>DBC({nav:'tables',title:'Table produits',toast:o.toast,dialog:o.dialog,items:[I('btn','import',800,80,170,34,{label:'Importer un CSV',primary:true}),I('row',null,240,150,730,36,{head:true,cells:['Nom','Prix (CDF)','Stock','Boutique'],cw:[260,150,120,190]}),I('row',null,240,186,730,40,{cells:['Pagne wax bleu 6 yards','45 000','3','Mama Ngozi'],cw:[260,150,120,190]})]});
  S(pr(),'import','clic','Cliquez sur [[Importer un CSV]].','Le gérant a rempli un tableur : nom, prix, stock.');
  const imp={title:'Aperçu de l’import · catalogue_pharmacie.csv',h:360,fields:[],buttons:[{id:'close',lab:'Corriger le fichier',primary:true}]};
  const prev=pr({dialog:imp});
  prev.items.push(I('row',null,275,170,450,32,{head:true,cells:['Nom','Prix','Stock'],cw:[220,120,100]}),I('row',null,275,202,450,32,{cells:['Paracétamol 500 mg','2 500','120'],cw:[220,120,100]}),I('row',null,275,234,450,32,{cells:['Amoxicilline 1 g','8 000','40'],cw:[220,120,100]}),I('row','l-err',275,266,450,32,{on:true,cells:['Sirop toux enfant','(vide) erreur','15'],cw:[220,120,100]}),I('text',null,275,325,0,0,{label:'Ligne 3 : prix obligatoire. Import bloqué.',size:12,fill:'#c8341f'}));
  S(prev,'l-err','clic','Repérez la [[ligne en erreur]].','La base refuse un produit sans prix : l’agent ne pourra jamais en inventer un.');
  S(prev,'close','clic','Cliquez sur [[Corriger le fichier]].','On corrige à la source (le tableur du gérant), puis on réimporte.');
  Q(S,'Mettre la boutique en service',[
    {q:'Le gérant envoie son catalogue en photo d’un cahier.',o:['On le recopie dans un tableur (nom, prix, stock), puis on importe le CSV','On laisse l’agent deviner les prix'],ok:0,why:'Le catalogue est la source de vérité de l’agent.'},
    {q:'Avant d’activer la boutique, que tester ?',o:['Une conversation sur le numéro de test, avec 2 ou 3 produits','Rien, l’import a marché'],ok:0,why:'Le test de la leçon 6 se refait pour chaque nouvelle boutique.'},
  ]);
});

/* ---------- SaaS n° 14 : mettre en ligne sur Vercel ---------- */
L(26,6,'Leçon 26 — Mettre le back-office en ligne sur Vercel','Terminal et hébergement (type Vercel), simulés',S=>{
  const d='~/projets/stock-quincaillerie';
  S(SHELL(['$ git status','Sur la branche main · rien à valider'],'dev@saas : '+d),'term-in','saisie','Envoyez le code sur GitHub : [[git push -u origin main]].','L’hébergeur déploie directement depuis le dépôt GitHub.','git push -u origin main');
  S(VCL({nav:'proj',title:'Projets',subtitle:'Offre de départ',items:[I('btn','new',800,80,170,34,{label:'Ajouter un projet',primary:true}),I('box',null,240,150,730,90,{title:'Aucun projet'})]}),'new','clic','Dans l’hébergeur, cliquez sur [[Ajouter un projet]].','');
  S(VCL({nav:'proj',title:'Importer un dépôt GitHub',items:[I('row',null,240,150,730,36,{head:true,cells:['Dépôt','Mis à jour'],cw:[450,260]}),I('row','r-stock',240,186,730,40,{cells:['stock-quincaillerie','il y a 1 min'],cw:[450,260]}),I('row',null,240,226,730,40,{cells:['vendeur-whatsapp','hier'],cw:[450,260]})]}),'r-stock','clic','Choisissez le dépôt [[stock-quincaillerie]].','');
  const env=(bad)=>[I('field',null,240,150,350,32,{lab:'Framework détecté',value:'Next.js'}),I('text',null,240,228,0,0,{label:'VARIABLES D’ENVIRONNEMENT',size:10.5,fill:'#5b6880',wt:700}),
    I('row',null,240,236,730,36,{cells:['NEXT_PUBLIC_SUPABASE_URL','https://xyz.supabase.co'],cw:[400,310]}),I('row',null,240,272,730,36,{cells:['NEXT_PUBLIC_SUPABASE_ANON_KEY','eyJhbGciOi…'],cw:[400,310]}),
    ...(bad?[I('row',null,240,308,730,36,{on:true,cells:['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY','eyJhbGciOi…'],cw:[400,310]}),I('btn','env-del',880,309,86,34,{label:'Retirer'})]:[]),
    I('btn','deploy',800,520,170,40,{label:'Déployer',primary:true})];
  S(VCL({nav:'proj',title:'Configurer le projet',items:env(true)}),'env-del','clic','Une variable expose une clé secrète au navigateur. [[Retirez]]-la.','Tout ce qui commence par NEXT_PUBLIC_ est envoyé au navigateur de chaque visiteur. La clé service_role n’y a pas sa place.');
  S(VCL({nav:'proj',title:'Configurer le projet',items:env(false),toast:'Variable retirée'}),'deploy','clic','Cliquez sur [[Déployer]].','');
  S(VCL({nav:'dep',title:'Déploiement',subtitle:'main · commit « Back-office stock v1 »',items:[I('lines',null,256,170,700,0,{mono:true,lines:['Installation des dépendances…','Construction (next build)…','✔ Construction réussie en 48 s']}),I('row','l-ready',240,250,730,40,{on:true,cells:['✔ Prêt · https://stock-quincaillerie.vercel.app'],cw:[720]})]}),'l-ready','clic','Repérez l’[[adresse du site]].','Testez toutes les pages avec un compte gérant et un compte vendeur avant de l’envoyer au client.');
  S(VCL({nav:'dom',title:'Domaines',items:[I('field','domain',240,160,500,34,{lab:'Ajouter un domaine',ph:'ex. stock.monclient.cd',mono:true}),I('btn','add-domain',760,160,140,34,{label:'Ajouter'})]}),'domain','saisie','Ajoutez le domaine du client : [[stock.bonprix.cd]].','Une adresse au nom du client inspire confiance.','stock.bonprix.cd');
  S(VCL({nav:'dom',title:'Domaines',items:[I('field','domain',240,160,500,34,{lab:'Ajouter un domaine',value:'stock.bonprix.cd',mono:true}),I('btn','add-domain',760,160,140,34,{label:'Ajouter'})]}),'add-domain','clic','Cliquez sur [[Ajouter]].','');
  S(VCL({nav:'dom',title:'Domaines',toast:'Domaine ajouté : configuration DNS requise',items:[I('row',null,240,160,730,36,{head:true,cells:['Type','Nom','Valeur'],cw:[120,200,400]}),I('row','l-dns',240,196,730,40,{on:true,cells:['CNAME','stock','cname.vercel-dns.com'],cw:[120,200,400]})]}),'l-dns','clic','Repérez l’[[enregistrement DNS]] à créer.','Le client (ou vous, avec son accord) l’ajoute chez le bureau d’enregistrement du domaine .cd.');
  Q(S,'Héberger pour un client',[
    {q:'L’offre gratuite de l’hébergeur convient-elle à un client qui vous paie ?',o:['Toujours, sans condition','Vérifiez les conditions : l’usage commercial peut exiger une offre payante'],ok:1,why:'Lisez les conditions du jour. Une offre gratuite « non commerciale » ne couvre pas un projet facturé.'},
    {q:'Chaque push sur main…',o:['ne fait rien','redéploie automatiquement le site : on ne pousse sur main que du code testé'],ok:1,why:'D’où l’intérêt des branches (leçon 27).'},
  ]);
});

L(27,6,'Leçon 27 — Branches, prévisualisations et retour arrière','Terminal, Claude Code et hébergement, simulés',S=>{
  const d='~/projets/stock-quincaillerie';
  S(SHELL(['$ git status','Sur la branche main'],'dev@saas : '+d),'term-in','saisie','Nouvelle fonctionnalité : créez une branche : [[git switch -c alertes-stock]].','main reste la version en production pendant que vous travaillez.','git switch -c alertes-stock');
  S(CC({dir:d,who:'branche alertes-stock'}),'cc-in','saisie','Demandez : [[Ajoute les alertes de rupture de stock]].','','Ajoute les alertes de rupture de stock');
  S(CC({dir:d,who:'branche alertes-stock',lines:['> Ajoute les alertes de rupture de stock','● Plan : colonne seuil_alerte, migration 004, écran Alertes, tests'],perm:PERM('Claude souhaite créer : supabase/migrations/004_seuil_alerte.sql et 3 fichiers',['Branche alertes-stock · base de test'],0)}),'ok','clic','Votre réponse ?','');
  S(SHELL(['$ git commit -am "Alertes de rupture de stock"','✔ 1 commit'],'dev@saas : '+d),'term-in','saisie','Envoyez la branche : [[git push -u origin alertes-stock]].','L’hébergeur crée une prévisualisation pour chaque branche.','git push -u origin alertes-stock');
  S(VCL({nav:'dep',title:'Déploiements',items:[I('row',null,240,150,730,36,{head:true,cells:['Environnement','Branche','Adresse'],cw:[150,170,400]}),I('row','d-preview',240,186,730,40,{on:true,cells:['Prévisualisation','alertes-stock','stock-git-alertes-stock.vercel.app'],cw:[150,170,400]}),I('row','d-prod',240,226,730,40,{cells:['Production','main','stock.bonprix.cd'],cw:[150,170,400]})]}),'d-preview','clic','Repérez l’adresse de [[prévisualisation]].','Le client teste la nouveauté sur cette adresse, sans toucher à la production.');
  S(VCL({nav:'dep',title:'Déploiements',items:[I('row',null,240,150,730,36,{head:true,cells:['Environnement','Version','État'],cw:[150,370,200]}),I('row',null,240,186,730,40,{on:true,cells:['Production','v1.4 · alertes de stock','⚠ erreurs à la caisse'],cw:[150,370,200]}),I('row','d-prev',240,226,730,40,{cells:['Production (précédente)','v1.3','stable'],cw:[150,370,200]}),I('btn','rollback',770,280,200,36,{label:'Revenir à cette version',primary:true})]}),'rollback','clic','Après la fusion, la caisse plante en production. Cliquez sur [[Revenir à cette version]] (v1.3).','On rétablit d’abord le service, puis on corrige sur une branche.');
  Q(S,'Mise en production',[
    {q:'La prévisualisation doit utiliser quelle base ?',o:['La base de production des clients','Une base, ou une branche Supabase, de test'],ok:1,why:'Une prévisualisation branchée sur la production peut abîmer de vraies données.'},
    {q:'Le client a validé la prévisualisation. Ensuite ?',o:['On fusionne la PR dans main ; la migration est appliquée en production après relecture','On copie les fichiers à la main sur le serveur'],ok:0,why:'Fusion = déploiement production automatique.'},
    {q:'Le retour à v1.3 annule-t-il la migration 004 de la base ?',o:['Oui, automatiquement','Non : le code revient en arrière, pas la base. La migration doit rester compatible avec v1.3'],ok:1,why:'Écrivez des migrations qui ajoutent sans casser l’ancienne version (ex. nouvelle colonne avec valeur par défaut).'},
  ]);
});

L(28,6,'Leçon 28 — Recueillir le besoin d’une application interne','Mises en situation',S=>{
  Q(S,'Comprendre le client',[
    {q:'Le client dit : « Je veux une appli de stock. » Première question ?',o:['Quelle couleur pour le logo ?','Qui l’utilise, pour quelles tâches, et qu’est-ce qui ne va pas aujourd’hui ?'],ok:1,why:'On part du problème réel, pas de la solution imaginée.'},
    {q:'Il utilise aujourd’hui un cahier et un fichier Excel.',o:['On demande un exemple réel de ses fichiers, sans données sensibles','On invente des données'],ok:0,why:'Le fichier réel montre les colonnes, les erreurs et les habitudes.'},
    {q:'Il demande 25 fonctionnalités.',o:['On fait tout dans la première version','On choisit les 3 à 5 indispensables pour la première version (MVP)'],ok:1,why:'Une v1 courte se livre vite, se teste et se facture.'},
    {q:'Comment transmettre le besoin à Claude Code ?',o:['« Fais une appli de stock »','Contexte, objectif, format et exigences, avec le fichier d’exemple'],ok:1,why:'Une demande complète donne un bon résultat du premier coup.'},
    {q:'Quel modèle de prix ?',o:['Frais de création + abonnement de maintenance','Gratuit pour se faire connaître'],ok:0,why:'La maintenance (hébergement, mises à jour, support) est un revenu récurrent.'},
  ]);
});

/* ---------- SaaS n° 15 : tableau de bord ---------- */
L(29,7,'Leçon 29 — Construire le tableau de bord web du gérant','Claude Code et tableau de bord, simulés',S=>{
  const d='~/projets/tableau-de-bord';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Crée une vue SQL des ventes par semaine et par boutique]].','Une vue SQL prépare les chiffres ; la page ne fait que les afficher.','Crée une vue SQL des ventes par semaine et par boutique');
  S(CC({dir:d,lines:['> Crée une vue SQL des ventes par semaine et par boutique'],perm:PERM('Claude souhaite créer : supabase/migrations/005_vue_ventes.sql',['Nouvelle vue · base de test'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d,lines:['✔ 005_vue_ventes.sql',{id:'l-inv',t:'  create view ventes_semaine with (security_invoker = true) as'},'    select boutique_id, date_trunc(\'week\', cree_le) as semaine,','           sum(total_cdf) as ca, count(*) as commandes','    from commandes group by 1, 2;']}),'l-inv','clic','Repérez l’option [[security_invoker]].','Sans elle, la vue s’exécute avec les droits de son créateur et contourne la RLS : chaque gérant verrait les ventes des autres.');
  S(CC({dir:d}),'cc-in','saisie','Demandez la page : [[Crée la page tableau de bord avec 4 indicateurs et un graphique]].','','Crée la page tableau de bord avec 4 indicateurs et un graphique');
  S(CC({dir:d,lines:['> Crée la page tableau de bord avec 4 indicateurs et un graphique'],perm:PERM('Claude souhaite créer : app/tableau-de-bord/page.tsx et 2 composants',['Lecture de la vue ventes_semaine avec la clé publique (RLS active)'],0)}),'ok','clic','Votre réponse ?','');
  S(HOME(),'k-rupt','clic','La page est prête. Cliquez sur l’indicateur en alerte : [[Ruptures]].','Un indicateur en alerte doit se voir au premier coup d’œil : couleur et forme différentes.');
  Q(S,'Vérifier avant de livrer',[
    {q:'Connecté comme gérant A, vous voyez les ventes du gérant B.',o:['C’est normal, c’est un tableau global','C’est une faille : vérifiez security_invoker et les règles RLS par boutique'],ok:1,why:'Testez toujours avec deux comptes de boutiques différentes.'},
    {q:'Le chiffre d’affaires affiché diffère de la caisse.',o:['On ajuste le chiffre à la main','On compare la requête de la vue avec les ventes réelles d’une journée'],ok:1,why:'Le tableau de bord n’a de valeur que s’il est juste.'},
  ]);
});

L(30,7,'Leçon 30 — Fiabiliser le résumé hebdomadaire (erreurs, coûts, tests)','Workflows (type n8n), simulé',S=>{
  const t='Résumé du lundi — 200 boutiques';
  const ns=[{...ND.sch,sub:'lundi 07:00'},{...ND.db,sub:'ventes et stocks'},{...ND.ai,sub:'résumé + alertes'},{...ND.was,sub:'au gérant'}];
  S(FLOW({title:t,nodes:ns,active:true}),'nav-exec','clic','Un gérant n’a rien reçu lundi. Ouvrez les [[Exécutions]].','L’historique des exécutions dit ce qui s’est passé, étape par étape.');
  const ex=APP({brand:'Workflows (type n8n)',logo:'⚙',color:'#ea4b71',side:[{id:'nav-wf',label:'Workflows'},{id:'nav-cred',label:'Identifiants'},{id:'nav-exec',label:'Exécutions',on:true}],title:'Exécutions',subtitle:t,items:[I('row',null,240,150,730,36,{head:true,cells:['Date','État','Détail'],cw:[180,120,420]}),I('row',null,240,186,730,40,{cells:['Lun. 03/11 07:00','Réussi','200 résumés envoyés'],cw:[180,120,420]}),I('row','e-fail',240,226,730,40,{on:true,cells:['Lun. 10/11 07:00','Échec','Supabase : délai dépassé (étape 2)'],cw:[180,120,420]})]});
  S(ex,'e-fail','clic','Repérez l’exécution en [[Échec]].','La base n’a pas répondu à temps : aucun résumé n’est parti, et personne n’a été prévenu.');
  S(FLOW({title:t,nodes:ns,active:true}),'n-db','clic','Ouvrez le nœud [[Supabase]].','');
  const fr=[{id:'op',k:'select',lab:'Opération',value:'Lire la vue ventes_semaine'},{k:'check',id:'retry',lab:'Réessayer en cas d’échec : 3 fois, toutes les 5 min'}];
  S(FLOW({title:t,nodes:ns,active:true,dialog:DLG('Supabase · réglages',fr,280)}),'retry','clic','Cochez [[Réessayer en cas d’échec]].','Une panne passagère ne doit pas priver 200 gérants de leur résumé.');
  S(FLOW({title:t,nodes:ns,active:true,dialog:DLG('Supabase · réglages',[fr[0],{...fr[1],on:true}],280)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns,active:true}),'nav-wf','clic','Ouvrez maintenant les réglages du workflow : cliquez sur [[Workflows]].','');
  const fe={id:'errwf',k:'select',lab:'Workflow en cas d’erreur',ph:'Aucun'};
  S(FLOW({title:t,nodes:ns,active:true,dialog:DLG('Réglages du workflow',[{...fe,menu:[{id:'err-ok',label:'Alerte admin (WhatsApp + e-mail)'},{id:'err-none',label:'Aucun'}]}],260)}),'err-ok','clic','Choisissez [[Alerte admin]] comme workflow d’erreur.','Si tout échoue malgré les reprises, vous êtes prévenu avant que le client ne se plaigne.');
  Q(S,'Exploiter à grande échelle',[
    {q:'Combien coûte l’API Claude pour 200 boutiques ?',o:['On ne s’en occupe pas','On estime les jetons par résumé × 200 × environ 4,3 semaines, et on l’intègre au prix'],ok:1,why:'Le coût de l’IA est un coût variable : il doit être couvert par l’abonnement.'},
    {q:'Comment tester une nouvelle version de la consigne ?',o:['Directement sur les vraies boutiques','Sur 3 jeux de données fictifs (semaine normale, rupture, aucune vente) avant chaque modification'],ok:1,why:'Des cas de test fixes permettent de comparer avant et après.'},
    {q:'Quel modèle utiliser pour ce résumé ?',o:['Toujours le plus puissant','Le modèle le moins coûteux qui réussit les tests'],ok:1,why:'Un résumé de 5 lignes n’exige pas le modèle le plus cher ; mesurez avec vos tests.'},
  ]);
});

L(31,7,'Leçon 31 — Lire le tableau de bord et régler les alertes','Tableau de bord (simulé)',S=>{
  S(HOME(),'k-ca','clic','Voici le tableau de bord du gérant. Cliquez sur le [[Chiffre d’affaires]].','C’est le total des ventes de la semaine.');
  S(HOME(),'k-rupt','clic','Un indicateur est en orange. Cliquez sur [[Ruptures]].','L’orange signale ce qui demande une action.');
  const st=(o={})=>DASH({nav:'stock',title:'Stock',subtitle:'Articles sous le seuil d’alerte en orange',toast:o.toast,items:[I('row',null,240,150,730,36,{head:true,cells:['Article','Stock','Seuil d’alerte'],cw:[360,160,200]}),I('row','r-ciment',240,186,730,40,{on:true,cells:['Ciment 50 kg','0',o.seuil||'non défini'],cw:[360,160,200]}),I('row',null,240,226,730,40,{on:true,cells:['Peinture blanche 20 L','3','5'],cw:[360,160,200]}),I('row',null,240,266,730,40,{cells:['Tôle bac 3 m','140','20'],cw:[360,160,200]})]});
  S(st(),'r-ciment','clic','Cliquez sur l’article [[Ciment 50 kg]].','Il n’a pas de seuil d’alerte : personne n’a été prévenu avant la rupture.');
  S(st(),'nav-alertes','clic','Ouvrez le menu [[Alertes]].','');
  const al=(v)=>DASH({nav:'alertes',title:'Alertes',subtitle:'Ciment 50 kg',items:[I('field','seuil',240,160,300,34,{lab:'Prévenir quand le stock descend sous',value:v,ph:'quantité'}),I('btn','save-alert',560,160,160,34,{label:'Enregistrer',primary:true}),I('lines',null,240,240,700,0,{lines:['L’alerte apparaît dans le résumé WhatsApp du lundi et en orange sur le tableau de bord.']})]});
  S(al(''),'seuil','saisie','Tapez le seuil : [[20]] sacs.','Choisissez un seuil qui laisse le temps de recommander chez le fournisseur.','20');
  S(al('20'),'save-alert','clic','Cliquez sur [[Enregistrer]].','');
  S(st({seuil:'20',toast:'Alerte enregistrée'}),'r-ciment','clic','Vérifiez la ligne [[Ciment 50 kg]] : le seuil est maintenant 20.','');
  Q(S,'Bien lire les chiffres',[
    {q:'Le tableau affiche 0 vente hier, mais la boutique était ouverte.',o:['On s’inquiète des ventes','On vérifie d’abord que les ventes ont bien été saisies'],ok:1,why:'Un chiffre étrange vient souvent d’une saisie manquante.'},
    {q:'Le panier moyen baisse depuis 3 semaines.',o:['On ignore','On en parle au gérant : promotions, rupture d’un produit phare… le chiffre pose une question'],ok:1,why:'Le tableau de bord sert à décider, pas seulement à regarder.'},
  ]);
});

/* ---------- Épreuves d'attestation : Débutant et Expert (l'épreuve Moyen est la leçon 22) ---------- */
L(32,8,'Leçon 32 — Épreuve Débutant (à faire en mode Évaluation)','Terminal, Claude Code et mises en situation',S=>{
  const d='~/projets/salon-beaute';
  S(SHELL(['$ mkdir salon-beaute','$ cd salon-beaute'],'dev@saas : '+d),'term-in','saisie','Activez l’historique des versions du projet.','Réponse attendue : git init.','git init');
  S(SHELL(['$ git init','✔ Dépôt Git vide initialisé'],'dev@saas : '+d),'term-in','saisie','Lancez l’agent dans ce dossier.','Réponse attendue : claude.','claude');
  S(CC({dir:d}),'cc-in','saisie','Créez la mémoire du projet.','Réponse attendue : /init.','/init');
  Q(S,'Épreuve Débutant',[
    {q:'Quel outil enchaîne : message reçu → réponse IA → enregistrement ?',o:['Supabase','n8n','GitHub'],ok:1,why:'n8n orchestre les étapes.'},
    {q:'Où ranger les clés API du projet ?',o:['Dans le code, c’est plus simple','Dans .env, fichier ignoré par Git'],ok:1,why:'Jamais de clé dans le code.'},
    {q:'Pour brancher WhatsApp à votre SaaS, vous utilisez…',o:['l’API officielle WhatsApp Business, avec un numéro de test d’abord','une application non officielle trouvée sur un forum'],ok:0,why:'API officielle uniquement.'},
    {q:'Le client demande un humain à l’agent WhatsApp.',o:['L’agent continue seul','L’agent transmet au gérant'],ok:1,why:'Le passage à un humain est prévu dans la consigne.'},
    {q:'Un client dit « J’ai payé » avec une capture d’écran.',o:['On livre','On attend la confirmation de l’agrégateur'],ok:1,why:'Seul l’agrégateur confirme un paiement.'},
    {q:'Le stock d’un article est sous son seuil d’alerte. Que montre le tableau de bord ?',o:['Rien','L’article en orange, et l’alerte dans le résumé du lundi'],ok:1,why:'Leçon 31.'},
    {q:'Avant de développer un SaaS…',o:['je vends 3 à 5 pré-commandes','je code 3 mois en secret'],ok:0,why:'On valide la demande d’abord.'},
  ]);
});

L(33,8,'Leçon 33 — Épreuve Expert (à faire en mode Évaluation)','Claude Code, hébergement et mises en situation',S=>{
  const d='~/projets/vendeur-whatsapp';
  S(CC({dir:d,lines:['> Ajoute le remboursement des paiements'],perm:PERM('Claude souhaite exécuter : supabase db push --linked',['Applique la migration 006 sur la base des clients réels'],2)}),'ok','clic','Répondez à la demande de permission.','Production : jamais sans test ni relecture.');
  S(CC({dir:d,lines:['● Configuration du webhook de remboursement'],perm:PERM('Claude souhaite modifier : supabase/functions/.env.example',['Ajout : PAIEMENT_SECRET=sk_live_8f2c… (valeur réelle)'],2)}),'ok','clic','Répondez à la demande de permission.','Aucun secret réel dans un fichier versionné.');
  S(CC({dir:d,lines:['> Lance les tests du webhook','✔ signature valide → 200','✔ signature fausse → 401',{id:'l-gap',t:'⚠ même référence envoyée 2 fois → 2 paiements enregistrés'},'✔ montant différent → 422']}),'l-gap','clic','Un test révèle une faille. Cliquez sur la ligne concernée.','Sans idempotence, un doublon de webhook crée un double paiement.');
  S(VCL({nav:'proj',title:'Configurer le projet',items:[I('row',null,240,150,730,36,{cells:['NEXT_PUBLIC_SUPABASE_URL','https://xyz.supabase.co'],cw:[400,310]}),I('row',null,240,186,730,36,{cells:['NEXT_PUBLIC_SUPABASE_ANON_KEY','eyJhbGciOi…'],cw:[400,310]}),I('row',null,240,222,730,36,{cells:['NEXT_PUBLIC_PAIEMENT_SECRET','sk_live_8f2c…'],cw:[400,310]}),I('btn','env-del',880,223,86,34,{label:'Retirer'}),I('btn','deploy',800,520,170,40,{label:'Déployer',primary:true})]}),'env-del','clic','Une variable ne doit pas partir vers le navigateur. Corrigez avant de déployer.','NEXT_PUBLIC_ = visible par chaque visiteur.');
  Q(S,'Épreuve Expert',[
    {q:'Le webhook reçoit une confirmation mais la base est indisponible.',o:['Répondre 200','Répondre 5xx : l’agrégateur réessaiera, l’idempotence évite le doublon'],ok:1,why:'Leçon 24.'},
    {q:'Une vue SQL du tableau de bord montre les ventes de toutes les boutiques à chaque gérant.',o:['Ajouter security_invoker et vérifier la RLS par boutique','Masquer la colonne boutique dans la page'],ok:0,why:'Leçon 29 : on corrige à la source, pas dans l’affichage.'},
    {q:'La version v1.5 casse la caisse en production.',o:['Revenir au déploiement précédent, puis corriger sur une branche','Corriger en direct sur main pendant des heures'],ok:0,why:'Leçon 27.'},
    {q:'Le retour à v1.4 après la migration 007 (suppression d’une colonne)…',o:['ne pose aucun problème','peut casser v1.4 : les migrations doivent rester compatibles avec la version précédente'],ok:1,why:'Le code revient en arrière, pas la base.'},
    {q:'Le résumé du lundi échoue silencieusement pour 200 boutiques.',o:['Ajouter des reprises automatiques et un workflow d’erreur qui alerte l’admin','Attendre que les clients se plaignent'],ok:0,why:'Leçon 30.'},
    {q:'Changer de modèle pour réduire le coût du résumé : comment décider ?',o:['Au hasard','Avec les mêmes jeux de test fictifs, avant et après le changement'],ok:1,why:'On mesure, on ne devine pas.'},
  ]);
});

/* ========================= Phase 2 : leçons ajoutées (SaaS n° 2, 4, 7, 12, 13) ========================= */
L(34,3,'Leçon 34 — Agenda partagé entre praticiens','Claude Code et messagerie, simulés',S=>{
  const d='~/projets/rdv-clinique';
  S(CC({dir:d}),'cc-in','saisie','La clinique a 3 médecins. Demandez : [[Ajoute un agenda par praticien avec des créneaux de 30 minutes]].','Chaque praticien a ses horaires, ses absences et ses propres créneaux.','Ajoute un agenda par praticien avec des créneaux de 30 minutes');
  const plan=['> Ajoute un agenda par praticien avec des créneaux de 30 minutes','● Plan proposé :','  1. Tables praticiens, horaires, absences, rendez_vous',{id:'l-overlap',t:'  2. Contrainte en base : deux rendez-vous du même praticien ne peuvent pas se chevaucher'},'  3. Fonction creneaux_libres(praticien, jour) pour l’agent WhatsApp',{id:'l-wait',t:'  4. Annulation : le créneau libéré est proposé au premier de la liste d’attente'}];
  S(CC({dir:d,lines:plan}),'l-overlap','clic','Repérez la protection contre les [[doubles réservations]].','Deux clients qui réservent à la même seconde : seule la base de données peut l’empêcher à coup sûr.');
  S(CC({dir:d,lines:plan}),'l-wait','clic','Repérez la gestion de la [[liste d’attente]].','Un créneau annulé rempli par un autre patient, c’est du chiffre d’affaires récupéré pour la clinique.');
  S(CC({dir:d,lines:['> Exécute le plan'],perm:PERM('Claude souhaite créer : supabase/migrations/003_agenda.sql et 2 fonctions',['Base de test'],0)}),'ok','clic','Votre réponse ?','');
  const T={title:'Test sur le numéro de test',subtitle:'Vous jouez le rôle du patient',side:[{id:'c-1',label:'Clinique Sainte Grâce',on:true}]};
  const m1={t:'Bonjour, je veux voir le Dr Mukendi jeudi matin',me:1,time:'08:12'};
  S(WA(T),'wa-in','saisie','Écrivez comme un patient : [[Bonjour, je veux voir le Dr Mukendi jeudi matin]].','','Bonjour, je veux voir le Dr Mukendi jeudi matin');
  S(WA({...T,input:m1.t}),'wa-send','clic','Cliquez sur [[Envoyer]].','');
  const m2={id:'m-slots',t:'Dr Mukendi, jeudi 13/11 :\n1. 08:30   2. 09:00   3. 10:30\nRépondez par le numéro du créneau.',time:'08:12'};
  S(WA({...T,msgs:[m1,m2]}),'m-slots','clic','Repérez les [[créneaux proposés]].','Seuls les créneaux libres sont proposés : la liste vient de la fonction creneaux_libres, pas de l’IA.');
  S(WA({...T,msgs:[m1,{...m2,id:null}]}),'wa-in','saisie','Choisissez le créneau : tapez [[2]].','','2');
  S(WA({...T,msgs:[m1,{...m2,id:null}],input:'2'}),'wa-send','clic','Cliquez sur [[Envoyer]].','');
  S(WA({...T,msgs:[m1,{...m2,id:null},{t:'2',me:1,time:'08:13'},{id:'m-ok',t:'Rendez-vous confirmé ✔ jeudi 13/11 à 09:00\nRappel la veille à 18:00. Répondez ANNULER pour libérer le créneau.',time:'08:13'}]}),'m-ok','clic','Repérez la [[confirmation]].','Le patient sait comment annuler : un créneau libéré tôt se revend.');
  Q(S,'Gérer un agenda partagé',[
    {q:'Le Dr Mukendi est en congé la semaine prochaine.',o:['On prévient chaque patient à la main','On enregistre l’absence : ses créneaux disparaissent, les rendez-vous déjà pris sont signalés à l’accueil'],ok:1,why:'L’absence est une donnée : le système en tire les conséquences.'},
    {q:'Deux patients choisissent le même créneau à la même seconde.',o:['Les deux sont confirmés','La base n’accepte que le premier ; le second reçoit les créneaux restants'],ok:1,why:'C’est le rôle de la contrainte de non-chevauchement.'},
  ]);
});

L(35,3,'Leçon 35 — Relance de facture avec lien de paiement pawaPay','Workflows (type n8n) et messagerie, simulés',S=>{
  const t='Recouvrement — Grossiste Kin Distribution';
  const sch={...ND.sch,sub:'chaque jour 09:00'}, db={...ND.db,sub:'factures échues'};
  S(FLOW({title:t,nodes:[sch,db]}),'add-next','clic','Les factures échues sont lues chaque matin. Ajoutez l’étape suivante : [[+]].','Un lien de paiement dans la relance transforme « je paierai » en paiement immédiat.');
  S(FLOW({title:t,nodes:[sch,db],drawer:{res:[RES.http,RES.was,RES.iff]}}),'res-http','clic','Ajoutez [[HTTP Request]].','On demande à pawaPay une page de paiement pour cette facture.');
  const http={id:'n-http',label:'Page de paiement',sub:'pawaPay · sandbox',c:'#1f4fa3',ico:'API'};
  const fh=[{id:'url',lab:'Service',value:'pawaPay · page de paiement (sandbox)'},{id:'body',lab:'Corps (JSON)',h:84,mono:true,value:'{ "depositId": "{{ $json.deposit_id }}",\n  "amount": "{{ $json.reste_du }}", "currency": "USD",\n  "reason": "Facture {{ $json.numero }}",\n  "returnUrl": "https://kin-distribution.cd/merci" }'},{id:'cred',lab:'Identifiant',value:'Jeton API pawaPay (sandbox)'}];
  S(FLOW({title:t,nodes:[sch,db,http],dialog:DLG('HTTP Request',fh,380)}),'body','clic','Repérez le [[depositId]] de la facture.','Le même identifiant relie la page de paiement, la confirmation de la leçon 24 et la facture dans la base.');
  S(FLOW({title:t,nodes:[sch,db,http],dialog:DLG('HTTP Request',fh,380)}),'close','clic','Fermez le panneau.','pawaPay renvoie l’adresse de la page où le client choisit son opérateur et paie.');
  S(FLOW({title:t,nodes:[sch,db,http]}),'add-next','clic','Ajoutez l’envoi : [[+]].','');
  S(FLOW({title:t,nodes:[sch,db,http],drawer:{res:[RES.was,RES.wait,RES.iff]}}),'res-was','clic','Ajoutez [[WhatsApp · Envoyer]].','');
  const fw={id:'tpl',k:'select',lab:'Modèle de message',ph:'Choisir un modèle approuvé…'};
  const ns=[sch,db,http,{...ND.was,sub:'relance + lien'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('WhatsApp · Envoyer',[{...fw,menu:[{id:'tpl-ok',label:'relance_facture (approuvé · utilitaire)'},{id:'tpl-x',label:'Texte libre'}]}],260)}),'tpl-ok','clic','Choisissez le modèle approuvé [[relance_facture]].','Le client n’a pas écrit depuis plus de 24 h : modèle approuvé par Meta obligatoire.');
  S(FLOW({title:t,nodes:ns,dialog:DLG('WhatsApp · Envoyer',[{...fw,value:'relance_facture'}],260)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:ns}),'save','clic','Cliquez sur [[Enregistrer]].','');
  S(FLOW({title:t,nodes:ns,toast:'Workflow enregistré'}),'active','clic','Activez le workflow.','');
  S(WA({title:'Client (numéro de test)',subtitle:'Ce que reçoit le client',side:[{id:'c-1',label:'Kin Distribution',on:true}],msgs:[{id:'m-link',t:'Bonjour, la facture F-2026-118 (420 USD) est échue depuis hier.\nPayer maintenant par Mobile Money : pay.example/F-2026-118\nUne question ? Répondez à ce message.',time:'09:00'}]}),'m-link','clic','Repérez le [[lien de paiement]] dans la relance.','Le ton reste courtois : c’est la première relance (J+1).');
  Q(S,'Relancer avec un lien',[
    {q:'Le client paie par le lien. Que se passe-t-il ?',o:['On attend qu’il envoie une capture','La confirmation pawaPay (leçon 24) marque la facture payée et arrête les relances'],ok:1,why:'Même identifiant, même circuit de confirmation que pour le vendeur WhatsApp.'},
    {q:'Le client a déjà payé en espèces au comptoir.',o:['La relance continue','La caissière marque la facture payée : la relance du lendemain ne part pas'],ok:1,why:'La relance lit le statut dans la base chaque matin.'},
    {q:'Le client paie seulement une partie.',o:['On marque la facture payée','On enregistre le paiement partiel ; la relance suivante indique le reste dû'],ok:1,why:'Le montant de la page de paiement est le reste dû, recalculé à chaque relance.'},
  ]);
});

L(36,4,'Leçon 36 — Calendrier éditorial et validation par le client','Console base de données, messagerie et workflows, simulés',S=>{
  const rows=(st)=>[I('row',null,240,150,730,36,{head:true,cells:['Date','Réseau','Sujet','Statut'],cw:[110,130,300,180]}),I('row',null,240,186,730,40,{cells:['10/11','Facebook','Nouvelle collection wax','Publié'],cw:[110,130,300,180]}),I('row','r-pub',240,226,730,40,{on:true,cells:['12/11','Instagram','Promo -10 % fin de mois',st],cw:[110,130,300,180]}),I('row',null,240,266,730,40,{cells:['14/11','Facebook','Témoignage cliente','Brouillon'],cw:[110,130,300,180]})];
  S(DBC({nav:'tables',title:'Table publications',subtitle:'Marque : Boutique Élégance',items:rows('À valider')}),'r-pub','clic','Claude a préparé les publications du mois. Repérez celle qui est [[À valider]].','Chaque publication passe par 4 statuts : Brouillon, À valider, Validé, Publié. Le calendrier vit dans la base, pas dans la mémoire de Claude.');
  const T={title:'Cliente (numéro de test)',subtitle:'Vous jouez le rôle de la gérante de la marque',side:[{id:'c-1',label:'Studio contenu',on:true}]};
  const m1={id:'m-prev',t:'Publication du 12/11 (Instagram) :\n« Fin de mois : -10 % sur toute la collection wax ! »\nRépondez OUI pour valider, ou écrivez votre correction.',time:'10:00'};
  S(WA({...T,msgs:[m1]}),'m-prev','clic','La gérante reçoit l’aperçu. Lisez le [[texte proposé]].','La validation se fait là où la cliente est déjà : sur WhatsApp.');
  S(WA({...T,msgs:[{...m1,id:null}]}),'wa-in','saisie','Validez comme la gérante : tapez [[OUI]].','','OUI');
  S(WA({...T,msgs:[{...m1,id:null}],input:'OUI'}),'wa-send','clic','Cliquez sur [[Envoyer]].','');
  S(DBC({nav:'tables',title:'Table publications',subtitle:'Marque : Boutique Élégance',toast:'Statut mis à jour : Validé',items:rows('Validé')}),'r-pub','clic','Vérifiez le statut : la publication est maintenant [[Validé]].','La réponse de la cliente, avec sa date, est enregistrée : en cas de litige, la preuve existe.');
  const ns=[{...ND.sch,sub:'chaque jour 08:00'},{...ND.db,sub:'publications du jour'},{id:'n-if',label:'If',sub:'statut = Validé',c:'#0e7490',ico:'?'},{id:'n-soc',label:'Publication',sub:'API officielle',c:'#1f4fa3',ico:'API'}];
  const fi=[{id:'v1',lab:'Valeur 1',value:'{{ $json.statut }}',mono:true},{id:'op',k:'select',lab:'Opérateur',value:'est égal à'},{id:'v2',lab:'Valeur 2',ph:'statut attendu'}];
  S(FLOW({title:'Publication programmée — Boutique Élégance',nodes:ns,dialog:DLG('If',fi,360)}),'v2','saisie','Dans le workflow de publication, la condition ne laisse passer qu’un statut. Tapez [[Validé]].','Un brouillon ou une publication « À valider » ne part jamais, même si la date est arrivée.','Validé');
  Q(S,'Publier pour une marque',[
    {q:'La cliente répond « Change -10 % en -15 % ».',o:['On publie la version d’origine','Claude corrige, le statut repasse à « À valider » et un nouvel aperçu est envoyé'],ok:1,why:'Toute correction repasse par la validation.'},
    {q:'La cliente ne répond pas avant la date prévue.',o:['On publie quand même','La publication reste en attente ; on la reprogramme et on relance la cliente'],ok:1,why:'Pas de validation, pas de publication.'},
  ]);
});

L(37,6,'Leçon 37 — Écrire un serveur MCP minimal avec Claude Code','Claude Code et terminal',S=>{
  const d='~/projets/mcp-stock-client';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Nouveau projet pour un client. Passez en [[mode plan]].','');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Crée un serveur MCP en lecture seule qui expose l’outil lire_stock]].','Un serveur MCP donne à Claude des outils précis, et rien d’autre.','Crée un serveur MCP en lecture seule qui expose l’outil lire_stock');
  const plan=['> Crée un serveur MCP en lecture seule qui expose l’outil lire_stock','● Plan proposé :','  1. TypeScript avec le SDK officiel MCP, transport HTTP',{id:'l-tool',t:'  2. Un seul outil : lire_stock(reference) → quantité et dépôt ; description claire, schéma d’entrée strict'},{id:'l-ro',t:'  3. Connexion à la base du client avec un compte en LECTURE SEULE'},'  4. Jeton d’accès obligatoire ; journal de chaque appel','  5. Tests : référence connue, inconnue, jeton absent'];
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-tool','clic','Repérez la définition de l’[[outil]].','Claude choisit ses outils d’après leur nom et leur description : une description vague donne des appels au hasard.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-ro','clic','Repérez le [[compte en lecture seule]].','Même si le code avait un défaut, ce compte ne peut rien modifier dans l’ERP.');
  S(CC({dir:d}),'cc-in','saisie','Plan validé. Tapez [[Exécute le plan]].','','Exécute le plan');
  S(CC({dir:d,lines:['> Exécute le plan'],perm:PERM('Claude souhaite créer : src/serveur.ts, src/outils/lire_stock.ts, tests/ (5 fichiers)',['Nouveaux fichiers'],0)}),'ok','clic','Votre réponse ?','');
  S(CC({dir:d,lines:['✔ 5 fichiers créés · tests : 3 réussis','● Je propose aussi un outil executer_sql(requete) pour les questions imprévues.'],perm:PERM('Claude souhaite créer : src/outils/executer_sql.ts',['Exécute n’importe quelle requête SQL envoyée par le modèle'],2)}),'ok','clic','Claude propose un outil « SQL libre ». Votre réponse ?','Un outil qui exécute n’importe quelle requête ouvre toute la base. On ajoute plutôt des outils précis, un par besoin.');
  S(SHELL(['$ npm run start','Serveur MCP prêt sur http://localhost:3000/mcp'],'dev@saas : '+d),'term-in','saisie','Testez le serveur avec l’inspecteur officiel : [[npx @modelcontextprotocol/inspector]].','L’inspecteur liste les outils et permet de les appeler à la main, sans Claude.','npx @modelcontextprotocol/inspector');
  S(SHELL(['$ npx @modelcontextprotocol/inspector','✔ Outils : lire_stock','✔ lire_stock("A-102") → 48 unités, dépôt Limete'],'dev@saas : '+d),'term-in','saisie','Branchez-le à Claude Code : [[claude mcp add --transport http stock-test http://localhost:3000/mcp]].','','claude mcp add --transport http stock-test http://localhost:3000/mcp');
  Q(S,'Livrer un serveur MCP',[
    {q:'Le client veut aussi « mettre à jour les prix ».',o:['On ouvre l’écriture sur toute la base','On ajoute un outil modifier_prix précis, validé avec lui, avec confirmation humaine'],ok:1,why:'L’écriture se décide outil par outil.'},
    {q:'Où ranger le jeton d’accès du serveur ?',o:['Dans le code source','Dans les variables d’environnement du serveur du client'],ok:1,why:'Aucun secret dans le code.'},
  ]);
});

L(38,6,'Leçon 38 — Régler la revue de code avec CLAUDE.md','Claude Code et forge de code',S=>{
  const d='~/projets/client-boutique';
  S(CC({dir:d}),'cc-in','saisie','La revue automatique signale trop de détails de style. Ouvrez la mémoire : [[/memory]].','Les règles de revue se rangent dans le CLAUDE.md du dépôt : Claude les lit à chaque revue.','/memory');
  const md=(extra)=>CC({dir:d+'/CLAUDE.md',noHead:true,lines:['# CLAUDE.md — client-boutique','## Revue de code',{id:'l-prio',t:'- Signaler en priorité : secrets dans le code, injection SQL, table sans RLS, prix calculé côté navigateur'},{id:'l-style',t:'- Ignorer le style (espaces, guillemets) : déjà vérifié par l’outil de mise en forme'},'- Chaque remarque cite le fichier, la ligne et une correction proposée',...(extra||[])]});
  S(md(),'l-prio','clic','Repérez les [[priorités]] de la revue.','Une revue utile parle d’abord de ce qui peut coûter cher.');
  S(md(),'l-style','clic','Repérez la règle sur le [[style]].','Le style est vérifié par un outil automatique : inutile d’encombrer la revue.');
  S(CC({dir:d}),'cc-in','saisie','Ajoutez une règle : [[Ajoute une règle de revue : toute requête SQL doit être paramétrée]].','','Ajoute une règle de revue : toute requête SQL doit être paramétrée');
  S(CC({dir:d,lines:['> Ajoute une règle de revue : toute requête SQL doit être paramétrée'],perm:PERM('Claude souhaite modifier : CLAUDE.md',['+ - Toute requête SQL doit être paramétrée ; signaler toute concaténation'],0)}),'ok','clic','Votre réponse ?','La règle s’appliquera à toutes les revues suivantes, pour toute l’équipe.');
  const gh=(o={})=>APP({brand:'Forge de code — client-boutique',logo:'</>',color:'#24292f',side:[{id:'nav-code',label:'Code'},{id:'nav-pr',label:'Propositions (PR)',on:true},{id:'nav-act',label:'Actions'}],title:'Proposition n° 9 — Recherche de produits',subtitle:'dev-junior veut fusionner 2 changements dans main',toast:o.toast,items:[
    I('box',null,240,140,730,170,{title:'claude (bot) a relu la proposition'}),
    I('lines',null,256,194,700,0,{lines:['1 remarque bloquante, 0 remarque de style :','recherche.js, ligne 14 : la requête concatène le texte saisi (règle CLAUDE.md).','Correction : requête paramétrée, voir la suggestion jointe.']}),
    I('row','l-rule',256,262,700,32,{on:true,cells:['Règle appliquée : « toute requête SQL doit être paramétrée »'],cw:[690]}),
    I('btn','merge',240,330,200,34,{label:'Fusionner la proposition',green:true})]});
  S(gh({toast:'Nouvelle revue de Claude'}),'l-rule','clic','Sur la proposition suivante, repérez la [[règle appliquée]].','La revue est courte, ciblée, et cite la règle de l’équipe.');
  Q(S,'Faire vivre la revue',[
    {q:'Qui décide de fusionner après la revue ?',o:['Claude, s’il ne trouve rien','Un développeur humain, après correction et relecture'],ok:1,why:'Claude signale ; un humain décide.'},
    {q:'Une même erreur revient souvent dans les propositions.',o:['On la corrige à chaque fois','On ajoute une règle dans CLAUDE.md et un test automatique'],ok:1,why:'Une règle écrite profite à toute l’équipe.'},
  ]);
});

/* ========================= Leçon 39 : calculer un abonnement qui couvre les coûts ========================= */
L(39,8,'Leçon 39 — Calculer un abonnement qui couvre Meta et pawaPay','Tableur (simulé) et mises en situation',S=>{
  const calc=(o={})=>APP({brand:'Tableur (simulé)',logo:'Σ',color:'#1d8a52',side:[{id:'nav-calc',label:'Prix d’une boutique',on:true},{id:'nav-hyp',label:'Hypothèses'}],
    title:'Coût mensuel d’une boutique · vendeur WhatsApp',subtitle:'Valeurs d’exemple : remplacez-les par les vraies grilles de Meta et de pawaPay',toast:o.toast,items:[
    I('field','c-tarif',240,170,330,34,{lab:'Prix Meta par message payant (USD)',value:o.tarif||'',ph:'ex. 0,02',mono:true}),
    I('field','c-msgs',620,170,330,34,{lab:'Messages payants par mois',value:o.msgs||'',ph:'ex. 400',mono:true}),
    I('row',null,240,240,730,36,{head:true,cells:['Poste de coût','USD par mois'],cw:[480,230]}),
    I('row','r-meta',240,276,730,38,{on:!!o.meta,cells:['Messages WhatsApp (Meta), payés par ZandoBoss',o.meta?'8,00':'—'],cw:[480,230]}),
    I('row',null,240,314,730,38,{cells:['API Claude (réponses et résumés, exemple)','5,00'],cw:[480,230]}),
    I('row',null,240,352,730,38,{cells:['Serveur n8n, base, outils (part par boutique, exemple)','3,00'],cw:[480,230]}),
    I('row','r-total',240,390,730,38,{head:true,cells:['Total des coûts',o.meta?'16,00':'—'],cw:[480,230]})]});
  S(calc(),'c-tarif','saisie','Saisissez le prix d’un message payant de Meta (valeur d’exemple) : [[0,02]].','Un message est « payant » quand vous l’envoyez en premier : relance, rappel, résumé. Les réponses dans les 24 h sont en principe gratuites. Vérifiez la vraie grille de Meta pour la RDC.','0,02');
  S(calc({tarif:'0,02'}),'c-msgs','saisie','Saisissez le nombre de messages payants d’une boutique moyenne : [[400]].','Mesurez-le sur vos boutiques pilotes : c’est la donnée la plus importante du calcul.','400');
  S(calc({tarif:'0,02',msgs:'400',meta:1}),'r-meta','clic','Repérez le coût [[Meta]] calculé : 400 × 0,02 = 8 USD.','C’est ZandoBoss SARLU qui paie ce coût, puisque les messages sont inclus dans l’abonnement.');
  S(calc({tarif:'0,02',msgs:'400',meta:1}),'r-total','clic','Repérez le [[total des coûts]] d’une boutique.','8 + 5 + 3 = 16 USD par mois. Votre prix doit couvrir ce total, puis dégager une marge.');
  Q(S,'Fixer le prix',[
    {q:'Coûts : 16 USD par mois. Vous voulez garder 50 % du prix comme marge.\nQuel prix minimum ?',o:['24 USD','32 USD','48 USD'],ok:1,why:'Prix = coûts ÷ (1 − marge) = 16 ÷ 0,5 = 32 USD. Ajouter 50 % aux coûts (24 USD) ne laisserait que 33 % de marge.'},
    {q:'La boutique qui relance le plus envoie 1 500 messages payants.\nSon coût Meta (à 0,02 USD) et le total ?',o:['30 USD de Meta, 38 USD au total','3 USD de Meta, 11 USD au total','300 USD de Meta, 308 USD au total'],ok:0,why:'1 500 × 0,02 = 30 USD, plus 5 + 3 = 38 USD : plus que l’abonnement Essentiel à 35 USD.'},
    {q:'Que faire de cette boutique qui coûte plus qu’elle ne paie ?',o:['Rien : on perd un peu sur elle chaque mois','Appliquer la clause d’usage raisonnable : en parler avec elle et proposer la formule Pro'],ok:1,why:'Le seuil de la clause se place là où le coût Meta absorbe la marge : ici, au-delà d’environ 1 000 messages payants par mois.'},
    {q:'pawaPay prend 3 % (exemple) sur chaque paiement. La boutique encaisse\n2 000 USD par mois. Combien coûtent ces frais ?',o:['6 USD','60 USD','600 USD'],ok:1,why:'2 000 × 3 % = 60 USD : presque le double de l’abonnement.'},
    {q:'Ces frais de paiement grandissent avec les ventes de la boutique. Qui les paie ?',o:['ZandoBoss, dans l’abonnement fixe','Ils sont déduits de chaque paiement reçu par la boutique, comme une commission de carte bancaire ; c’est écrit dans le contrat'],ok:1,why:'Un abonnement fixe ne peut pas absorber un coût qui suit le chiffre d’affaires du client. Les messages WhatsApp, eux, restent inclus.'},
    {q:'Quand recalculer les prix ?',o:['Jamais, une fois fixés','Dès que Meta ou pawaPay change sa grille, et chaque trimestre avec la consommation réelle'],ok:1,why:'Les grilles évoluent : un prix juste aujourd’hui peut devenir perdant demain.'},
  ]);
});

/* ========================= Phases 3 et 4 : leçons ajoutées (SaaS n° 3, 16, 5, 6, 8, 9, 10, 11) ========================= */
L(40,3,'Leçon 40 — KYC : extraire et contrôler une pièce d’identité avec l’API Claude','Claude Code',S=>{
  const d='~/projets/kyc-microfinance';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Données sensibles : passez en [[mode plan]].','');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Crée l’extraction des pièces d’identité avec l’API Claude]].','L’API Claude lit l’image de la pièce et renvoie les champs dans un format fixe.','Crée l’extraction des pièces d’identité avec l’API Claude');
  const plan=['> Crée l’extraction des pièces d’identité avec l’API Claude','● Plan proposé :',{id:'l-json',t:'  1. Réponse au format JSON fixe : nom, prénoms, numéro, date de naissance, date d’expiration'},{id:'l-coh',t:'  2. Contrôles : pièce expirée, âge < 18 ans, nom différent de celui déclaré → statut « À vérifier »'},{id:'l-human',t:'  3. Aucune validation automatique : l’agent KYC voit l’image et les champs côte à côte'},'  4. Tests sur 10 pièces fictives fournies par la microfinance'];
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-json','clic','Repérez le [[format JSON fixe]].','Un format fixe se vérifie automatiquement : un champ manquant se voit tout de suite.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-coh','clic','Repérez les [[contrôles de cohérence]].','L’IA peut mal lire un chiffre : les contrôles attrapent les incohérences.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-human','clic','Repérez qui [[valide]] le dossier.','La décision d’ouvrir un compte reste humaine.');
  S(CC({dir:d,lines:['> Exécute le plan, puis teste-le'],perm:PERM('Claude souhaite lire : le compartiment pieces-identite de la base de PRODUCTION',['Pièces d’identité de vrais clients'],2)}),'ok','clic','Pour tester, Claude veut lire de vraies pièces de clients. Votre réponse ?','Les tests se font sur des pièces fictives, jamais sur de vrais dossiers.');
  S(CC({dir:d,lines:['✔ Tests sur 10 pièces fictives','  8 dossiers : champs extraits, statut « Prêt pour l’agent »',{id:'l-flag',t:'⚠ piece_test_007 : date d’expiration 03/2025 dépassée → statut « À vérifier »'},'  piece_test_009 : photo floue → demande d’une nouvelle photo au client']}),'l-flag','clic','Repérez le dossier signalé [[À vérifier]].','Le système signale, l’agent tranche.');
  Q(S,'Extraction de pièces',[
    {q:'L’extraction donne une date de naissance illisible.',o:['Claude devine la date la plus probable','Le champ reste vide et le client renvoie une photo nette'],ok:1,why:'Jamais de donnée inventée dans un dossier d’identification.'},
    {q:'Que gardez-vous dans les journaux techniques ?',o:['L’image et tous les champs, pour déboguer','Le numéro de dossier et le statut, sans image ni donnée personnelle'],ok:1,why:'Les journaux circulent plus que la base : rien de sensible dedans.'},
  ]);
});

L(41,7,'Leçon 41 — Veille de conformité : des dates d’un contrat aux alertes','Claude Code et workflows, simulés',S=>{
  const d='~/clients/transport-express';
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Extrais les échéances de Contrats/assurance_flotte.pdf au format JSON]].','Chaque date doit indiquer où elle a été trouvée.','Extrais les échéances de Contrats/assurance_flotte.pdf au format JSON');
  const ex=['> Extrais les échéances de Contrats/assurance_flotte.pdf au format JSON','  {',{id:'l-src',t:'    "renouvellement": "2027-01-15", "source": "page 3, article 8",'},'    "preavis_resiliation": "60 jours", "source": "page 4, article 11",',{id:'l-null',t:'    "revision_prime": null, "note": "aucune date trouvée dans le document"'},'  }'];
  S(CC({dir:d,lines:ex}),'l-src','clic','Repérez la [[source]] de la date de renouvellement.','La page et l’article permettent à une personne de vérifier en dix secondes.');
  S(CC({dir:d,lines:ex}),'l-null','clic','Repérez le champ [[vide]].','Claude n’invente pas de date absente : le champ reste vide et le client est interrogé.');
  const t='Alertes d’échéances — Transport Express';
  const ns=[{...ND.sch,sub:'chaque jour 08:00'},{...ND.db,sub:'échéances proches'}];
  S(FLOW({title:t,nodes:ns}),'n-db','clic','Dans le workflow d’alertes, ouvrez le nœud [[Supabase]].','');
  const fd=[{id:'table',lab:'Table',value:'echeances'},{id:'filter',lab:'Filtre',ph:'jours restants'}];
  S(FLOW({title:t,nodes:ns,dialog:DLG('Supabase',fd,300)}),'filter','saisie','Filtrez les échéances à J-30, J-7 et J-1 : tapez [[jours_restants in (30, 7, 1)]].','Trois rappels : le temps de préparer, le temps d’agir, la dernière chance.','jours_restants in (30, 7, 1)');
  S(FLOW({title:t,nodes:ns,dialog:DLG('Supabase',[fd[0],{...fd[1],value:'jours_restants in (30, 7, 1)'}],300)}),'close','clic','Fermez le panneau.','Les étapes suivantes envoient l’alerte par WhatsApp et par e-mail au responsable.');
  Q(S,'Veille de conformité',[
    {q:'La licence de transport expire dans 7 jours et personne n’a réagi à l’alerte J-30.',o:['On attend J-1','L’alerte J-7 part aussi au dirigeant, en plus du responsable'],ok:1,why:'Une escalade progressive évite qu’une alerte reste sans réponse.'},
  ]);
});

L(42,4,'Leçon 42 — Usine à pubs : calculer le coût par vidéo et le prix des packs','Mises en situation',S=>{
  const ctx=['Valeurs d’EXEMPLE (remplacez par la grille réelle du fournisseur vidéo) :','  · 1 vidéo de 15 s = 20 crédits · pack de 1 000 crédits = 50 USD','  · script par l’API Claude : 0,05 USD par vidéo','  · le client refuse 1 vidéo sur 2 : elle est générée à nouveau'];
  Q(S,'Prix des packs vidéo',[
    {ctx,q:'Combien coûtent les crédits d’UNE vidéo générée ?',o:['0,50 USD','1 USD','20 USD'],ok:1,why:'50 USD ÷ 1 000 crédits = 0,05 USD le crédit ; × 20 crédits = 1 USD.'},
    {ctx,q:'Avec 1 vidéo refusée sur 2, combien coûte une vidéo LIVRÉE (crédits + script) ?',o:['1,05 USD','1,58 USD','2,10 USD'],ok:1,why:'1,5 génération en moyenne : 1,5 × (1 + 0,05) ≈ 1,58 USD. Les refus font partie du coût.'},
    {ctx,q:'Pack de 10 vidéos livrées, marge de 50 % du prix. Prix minimum ?',o:['15,80 USD','31,60 USD','23,70 USD'],ok:1,why:'Coût 15,80 USD ÷ (1 − 0,5) = 31,60 USD. Arrondissez au-dessus, par exemple 35 USD.'},
    {q:'Un client demande 15 nouvelles versions de la même vidéo.',o:['On les génère toutes, c’est inclus','Le pack inclut 2 corrections par vidéo ; au-delà, chaque version consomme des crédits du pack'],ok:1,why:'Fixez les corrections incluses dans l’offre, sinon une seule vidéo peut coûter le prix du pack.'},
  ]);
});

L(43,4,'Leçon 43 — Packshots : livrer automatiquement les rendus au client','Workflows (type n8n) et messagerie, simulés',S=>{
  const t='Livraison des rendus — Studio packshots';
  const wh={id:'n-wh',label:'Webhook',sub:'rendus terminés',c:'#7b3fa0',ico:'⇣'}, st={id:'n-st',label:'Stockage privé',sub:'Supabase',c:'#1d8a52',ico:'DB'};
  S(FLOW({title:t,nodes:[wh,st]}),'n-st','clic','Le script Blender signale la fin des rendus. Ouvrez le nœud [[Stockage privé]].','Les rendus du client ne doivent pas être publics avant qu’il les ait payés et validés.');
  const fs=[{id:'bucket',lab:'Compartiment',value:'rendus-clients (privé)'},{id:'duree',lab:'Durée du lien de téléchargement',ph:'ex. 7 jours'}];
  S(FLOW({title:t,nodes:[wh,st],dialog:DLG('Stockage privé',fs,300)}),'duree','saisie','Le lien envoyé au client expire : tapez [[7 jours]].','Un lien temporaire limite les dégâts s’il est transféré à quelqu’un d’autre.','7 jours');
  S(FLOW({title:t,nodes:[wh,st],dialog:DLG('Stockage privé',[fs[0],{...fs[1],value:'7 jours'}],300)}),'close','clic','Fermez le panneau.','');
  S(FLOW({title:t,nodes:[wh,st]}),'add-next','clic','Ajoutez l’envoi au client : [[+]].','');
  S(FLOW({title:t,nodes:[wh,st],drawer:{res:[RES.was,RES.wait,RES.http]}}),'res-was','clic','Choisissez [[WhatsApp · Envoyer]].','');
  const ns=[wh,st,{...ND.was,sub:'lien de téléchargement'}];
  S(FLOW({title:t,nodes:ns}),'save','clic','Cliquez sur [[Enregistrer]].','');
  S(WA({title:'Client (numéro de test)',subtitle:'Ce que reçoit le client',side:[{id:'c-1',label:'Studio packshots',on:true}],msgs:[{id:'m-dl',t:'Vos 12 rendus sont prêts (3 angles × 4 produits).\nTélécharger : lien valable 7 jours.\nUne retouche ? Répondez avec le nom du fichier.',time:'16:40'}]}),'m-dl','clic','Repérez le [[lien de téléchargement]].','Le client sait combien de fichiers attendre et comment demander une retouche.');
  Q(S,'Livrer des fichiers',[{q:'Le client n’a pas téléchargé ses rendus en 7 jours.',o:['On supprime tout','Le lien a expiré, mais les fichiers restent : on renvoie un nouveau lien sur demande'],ok:1,why:'Le lien expire, pas les fichiers : leur durée de conservation est fixée au contrat.'}]);
});

L(44,5,'Leçon 44 — Visite virtuelle : du plan au modèle Blender, puis au web','Claude Code et terminal',S=>{
  const d='~/projets/visite-appartement-gombe';
  S(CC({dir:d}),'cc-in','saisie','L’agence a fourni le plan en SVG. Demandez : [[Écris un script Blender qui monte les murs du plan à 2,80 m]].','Blender importe le plan, le script élève les murs à la bonne hauteur.','Écris un script Blender qui monte les murs du plan à 2,80 m');
  S(CC({dir:d,lines:['> Écris un script Blender qui monte les murs du plan à 2,80 m'],perm:PERM('Claude souhaite créer : scripts/murs_depuis_plan.py',['Import de plan.svg, extrusion des murs à 2,80 m, export en .glb'],0)}),'ok','clic','Votre réponse ?','');
  S(SHELL(['$ ls','plan.svg  scripts/  photos/'],'dev@saas : '+d),'term-in','saisie','Lancez le script sans interface : [[blender -b -P scripts/murs_depuis_plan.py -- plan.svg]].','Le résultat est un fichier appartement.glb, lisible par un navigateur.','blender -b -P scripts/murs_depuis_plan.py -- plan.svg');
  S(SHELL(['$ blender -b -P scripts/murs_depuis_plan.py -- plan.svg','✔ 14 murs créés · hauteur 2,80 m','✔ appartement.glb exporté (6,2 Mo)'],'dev@saas : '+d),'term-in','saisie','Revenez dans l’agent : tapez [[claude]].','','claude');
  S(CC({dir:d}),'cc-in','saisie','Demandez la visite web : [[Crée une page Three.js de visite de appartement.glb]].','La visite web légère s’ouvre sur un téléphone, sans application.','Crée une page Three.js de visite de appartement.glb');
  S(CC({dir:d,lines:['> Crée une page Three.js de visite de appartement.glb','✔ index.html : déplacement au doigt, 4 points de vue (salon, cuisine, chambres)',{id:'l-dim',t:'⚠ À vérifier : les cotes du plan sont-elles en mètres ? Le séjour mesure 41 m de long.'}]}),'l-dim','clic','Repérez l’[[alerte sur les cotes]].','Un plan en centimètres lu en mètres donne un appartement géant : on vérifie l’échelle avec l’agence.');
  Q(S,'Visites virtuelles',[{q:'L’agence veut des photos réalistes dans la visite.',o:['On prend des photos sur Internet','On utilise ses propres photos, ou des matériaux libres de droits'],ok:1,why:'Les photos d’autrui ne s’utilisent pas sans droits.'}]);
});

L(45,5,'Leçon 45 — Alléger un modèle 3D pour le mobile','Terminal et Claude Code',S=>{
  const d='~/projets/configurateur-cuisine';
  S(SHELL(['$ ls -lh','cuisine.glb   182M'],'dev@saas : '+d),'term-in','saisie','Le modèle pèse 182 Mo. Optimisez-le : [[npx @gltf-transform/cli optimize cuisine.glb cuisine-web.glb]].','L’outil libre glTF-Transform fusionne, simplifie et compresse géométrie et textures.','npx @gltf-transform/cli optimize cuisine.glb cuisine-web.glb');
  S(SHELL(['$ npx @gltf-transform/cli optimize cuisine.glb cuisine-web.glb','✔ cuisine-web.glb écrit','$ ls -lh','cuisine.glb       182M','cuisine-web.glb   9,4M'],'dev@saas : '+d),'term-in','saisie','Comparez visuellement : lancez [[claude]] pour préparer la page de comparaison.','On ne livre jamais une optimisation sans l’avoir regardée.','claude');
  S(CC({dir:d}),'cc-in','saisie','Demandez : [[Crée une page qui affiche les deux modèles côte à côte]].','','Crée une page qui affiche les deux modèles côte à côte');
  S(CC({dir:d,lines:['> Crée une page qui affiche les deux modèles côte à côte','✔ comparaison.html créé',{id:'l-tex',t:'⚠ Textures du plan de travail floues dans cuisine-web.glb (compression trop forte)'}]}),'l-tex','clic','Repérez le [[défaut]] signalé.','On règle la compression texture par texture : le plan de travail se vend sur sa finition.');
  Q(S,'Optimiser pour le mobile',[
    {q:'Quel objectif de poids viser pour un configurateur mobile ?',o:['Le plus léger possible, sans regarder','Le poids qui charge vite sur une connexion mobile lente, en gardant net ce que le client achète'],ok:1,why:'Testez sur un vrai téléphone, avec une connexion lente.'},
    {q:'Faut-il garder cuisine.glb (182 Mo) ?',o:['Non, on le supprime','Oui : c’est la source ; on régénère la version web à chaque modification'],ok:1,why:'On optimise toujours depuis la source, jamais une version déjà compressée.'},
  ]);
});

L(46,5,'Leçon 46 — Simulateur HSE : créer un scénario de sécurité pour un client','Mises en situation',S=>{
  Q(S,'Créer un scénario HSE',[
    {q:'Une mine veut former ses conducteurs à la consignation d’un engin.\nPar où commencer ?',o:['Inventer la procédure avec Claude','Obtenir la procédure officielle de la mine, validée par son responsable sécurité'],ok:1,why:'Le contenu de sécurité vient du client et de son expert, pas de l’IA.'},
    {q:'Le logiciel de la mine n’existe pas en simulation. Comment le reproduire ?',o:['Captures d’écran du vrai poste, puis rubriques tracées dans l’onglet « Cartographier »','Une description en texte'],ok:0,why:'C’est exactement l’usage de l’espace formateur du simulateur.'},
    {q:'Une étape critique : « couper l’alimentation avant d’intervenir ».\nComment la noter ?',o:['Comme les autres étapes','En mode Évaluation, une erreur sur cette étape fait échouer l’épreuve, quel que soit le score'],ok:1,why:'Certaines erreurs ne se compensent pas : à préciser avec le responsable sécurité.'},
    {q:'Qui signe le certificat HSE de chaque conducteur ?',o:['ZandoBoss SARLU seule','La mine (son responsable sécurité), à partir des résultats du simulateur'],ok:1,why:'Le simulateur prouve l’entraînement ; l’habilitation reste la décision de l’employeur.'},
    {q:'Quel modèle de prix ?',o:['Licence par entreprise et par apprenant, plus la création des scénarios sur devis','Gratuit'],ok:0,why:'La création du scénario est un projet ; la licence est un revenu récurrent.'},
  ]);
});

L(47,5,'Leçon 47 — Pipeline d’assets : de Blender à Unreal par scripts','Claude Code et terminal',S=>{
  const d='~/projets/assets-studio-kin';
  S(CC({dir:d,mode:'⏵ mode par défaut (Maj+Tab pour changer)',modeId:'mode'}),'mode','clic','Le studio envoie 500 modèles. Passez en [[mode plan]].','');
  S(CC({dir:d,mode:'⏸ mode plan activé'}),'cc-in','saisie','Demandez : [[Prépare un pipeline Blender vers Unreal pour le dossier sources]].','','Prépare un pipeline Blender vers Unreal pour le dossier sources');
  const plan=['> Prépare un pipeline Blender vers Unreal pour le dossier sources','● Plan proposé :','  1. scripts/lod.py (Blender) : 3 niveaux de détail par modèle, export .fbx',{id:'l-name',t:'  2. Nommage imposé : SM_<Nom>_LOD0..2 ; un modèle mal nommé est mis de côté, pas renommé au hasard'},'  3. scripts/import_unreal.py (Python de l’éditeur Unreal) : import en lot dans /Game/Assets',{id:'l-report',t:'  4. Rapport : modèles traités, rejetés et pourquoi'}];
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-name','clic','Repérez la règle de [[nommage]].','Le préfixe SM_ (Static Mesh) suit la convention d’Unreal : le studio retrouve tout de suite ses fichiers.');
  S(CC({dir:d,mode:'⏸ mode plan activé',lines:plan}),'l-report','clic','Repérez le [[rapport]] de fin de traitement.','Sur 500 fichiers, le rapport est ce que le client lit en premier.');
  S(SHELL(['$ # Test sur 5 modèles avant les 500'],'dev@saas : '+d),'term-in','saisie','Testez d’abord sur un échantillon : [[blender -b -P scripts/lod.py -- echantillon/]].','On valide le pipeline sur 5 modèles avant de traiter les 500.','blender -b -P scripts/lod.py -- echantillon/');
  S(SHELL(['$ blender -b -P scripts/lod.py -- echantillon/','✔ 4 modèles : LOD0, LOD1, LOD2 exportés','⚠ 1 rejeté : chaise-v2-FINAL(1).blend (nom non conforme)'],'dev@saas : '+d),'term-in','saisie','Enregistrez le pipeline validé : [[git commit -am "Pipeline LOD et import Unreal"]].','','git commit -am "Pipeline LOD et import Unreal"');
  Q(S,'Pipeline d’assets',[
    {q:'Le studio veut vendre ces assets sur une marketplace.',o:['On publie tout','On vérifie d’abord la licence de chaque modèle source et les conditions de la marketplace'],ok:1,why:'Un modèle sous licence non commerciale ne se revend pas.'},
    {q:'Où lancer l’import en lot dans Unreal ?',o:['Directement dans le projet du studio en production','Dans une copie du projet, versionnée, puis fusion après contrôle'],ok:1,why:'Un import raté de 500 fichiers se rattrape facilement sur une copie.'},
  ]);
});

/* Niveau de chaque leçon : 1 = Débutant, 2 = Moyen, 3 = Expert */
const NIVEAU = {1:1,2:1,3:2,4:1,5:2,6:1,7:1,8:3,9:1,10:2,11:3,12:1,13:3,14:2,15:3,16:3,17:2,18:2,19:2,20:1,21:1,22:2,23:2,24:3,25:1,26:2,27:3,28:1,29:2,30:3,31:1,32:1,33:3,34:2,35:2,36:1,37:3,38:2,39:2,40:3,41:2,42:2,43:2,44:2,45:3,46:1,47:3};
out.forEach(c=>{ c.niveau = NIVEAU[c.lecon] || 1; });
