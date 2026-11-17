// Espace administrateur de G-Challenge : appelle l'API du même serveur avec le jeton de connexion.
(function () {
  var jeton = null;
  try { jeton = sessionStorage.getItem('gc-admin'); } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  var NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', tres_difficile: 'Très difficile' };

  function api(methode, chemin, corps) {
    return fetch(chemin, {
      method: methode,
      headers: Object.assign({ 'Content-Type': 'application/json' }, jeton ? { Authorization: 'Bearer ' + jeton } : {}),
      body: corps ? JSON.stringify(corps) : undefined,
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.erreur ? j.erreur.message : 'Erreur ' + r.status);
        return j;
      });
    });
  }
  function dire(id, texte, ok) { var el = $(id); el.textContent = texte; el.className = 'message ' + (ok ? 'ok' : 'erreur'); }
  var dollars = function (c) { return (Number(c) / 100).toFixed(2).replace('.', ',') + ' $'; };
  var centimes = function (v) { return Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0; };
  function cellule(tr, texte) { var td = document.createElement('td'); td.textContent = texte; tr.appendChild(td); return td; }

  function prochainLundi() {
    var d = new Date(); d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  }

  function charger() {
    return Promise.all([api('GET', '/admin/tournois'), api('GET', '/pays'),
      api('GET', '/admin/primes?statut=a_verser_manuellement'), api('GET', '/admin/primes?statut=echoue')])
      .then(function (r) {
        var t = r[0], pays = r[1], primes = r[2].concat(r[3]);
        var f = $('formPrimes');
        f.prime_semaine.value = (t.reglages.prime_semaine_centimes / 100).toFixed(2);
        f.nb_equipes_primees.value = t.reglages.nb_equipes_primees;
        f.coupe_championne.value = (t.reglages.coupe_prime_championne_centimes / 100).toFixed(2);
        f.coupe_finaliste.value = (t.reglages.coupe_prime_finaliste_centimes / 100).toFixed(2);
        f.validation_primes.checked = !!t.reglages.validation_primes;
        f.invitation_jours_actifs.value = t.reglages.invitation_jours_actifs;
        f.invitation_periode_jours.value = t.reglages.invitation_periode_jours;
        f.invitations_sms.checked = !!t.reglages.invitations_sms;

        var sel = $('choixPays');
        if (!sel.options.length) {
          pays.filter(function (p) { return p.continent === 'AF'; }).forEach(function (p) {
            var o = document.createElement('option'); o.value = p.code; o.textContent = p.nom; sel.appendChild(o);
          });
          sel.value = 'CD';
          $('formChampionnat').premier_lundi.value = prochainLundi();
        }
        var zone = $('choixCircuits'); zone.textContent = '';
        $('sansCircuit').hidden = t.circuits.length > 0;
        $('boutonChampionnat').disabled = !t.circuits.length;
        ['Semaine 1 · qualifications', 'Semaine 2', 'Semaine 3', 'Semaine 4', 'Semaine 5'].forEach(function (nom, i) {
          var l = document.createElement('label'); l.textContent = nom;
          var s = document.createElement('select'); s.name = 'circuit' + i;
          t.circuits.forEach(function (c, k) {
            var o = document.createElement('option'); o.value = c.code; o.textContent = c.nom + ' · ' + NIVEAUX[c.difficulte] + (c.longueur_m ? ' · ' + (c.longueur_m / 1000).toString().replace('.', ',') + ' km' : ''); if (k === i % t.circuits.length) o.selected = true; s.appendChild(o);
          });
          l.appendChild(s); zone.appendChild(l);
        });

        var corps = $('listeCompetitions'); corps.textContent = '';
        t.championnats.forEach(function (c) {
          var tr = document.createElement('tr');
          cellule(tr, c.nom + ' (' + c.pays_code + ')'); cellule(tr, c.sponsor); cellule(tr, c.premier_lundi.slice(0, 10));
          cellule(tr, c.semaine_ouverte ? c.semaine_ouverte + ' / ' + c.semaines : '—');
          var iv = c.invitations || { envoyee: 0, acceptee: 0, refusee: 0 };
          var ti = cellule(tr, iv.acceptee + ' inscrits · ' + iv.envoyee + ' en attente · ' + iv.refusee + ' refus ');
          if (c.statut === 'active') {
            var bi = document.createElement('button'); bi.type = 'button'; bi.className = 'secondaire'; bi.textContent = 'Inviter maintenant'; bi.style.marginTop = '6px';
            bi.addEventListener('click', function () {
              bi.disabled = true;
              api('POST', '/admin/tournois/championnats/' + c.id + '/inviter').then(function (r) { alert(r.nouvelles + ' nouvelle(s) invitation(s) envoyée(s).'); return charger(); })
                .catch(function (err) { alert(err.message); bi.disabled = false; });
            });
            ti.appendChild(bi);
          }
          var e = cellule(tr, ''); var p = document.createElement('span'); p.className = 'puce ' + c.statut; p.textContent = c.statut; e.appendChild(p);
          corps.appendChild(tr);
        });
        t.coupes.forEach(function (c) {
          var tr = document.createElement('tr');
          cellule(tr, c.nom + (c.championne ? ' · championne : ' + c.championne : '')); cellule(tr, c.sponsor); cellule(tr, c.premier_lundi.slice(0, 10));
          cellule(tr, 'primes ' + (c.primes_centimes || []).map(dollars).join(' / ')); cellule(tr, '—');
          var e = cellule(tr, ''); var p = document.createElement('span'); p.className = 'puce ' + c.statut; p.textContent = c.statut; e.appendChild(p);
          corps.appendChild(tr);
        });
        if (!t.championnats.length && !t.coupes.length) { var tr = document.createElement('tr'); cellule(tr, 'Aucune compétition pour le moment.').colSpan = 6; corps.appendChild(tr); }

        var liste = $('listePrimes'); liste.textContent = '';
        primes.forEach(function (p) {
          var tr = document.createElement('tr');
          cellule(tr, p.pseudo); cellule(tr, p.equipe); cellule(tr, '+' + p.telephone); cellule(tr, dollars(p.montant_centimes) + ' ' + p.devise);
          cellule(tr, p.statut === 'echoue' ? 'échouée' : 'à verser à la main');
          var td = cellule(tr, '');
          if (p.statut === 'echoue') {
            var b = document.createElement('button'); b.className = 'secondaire'; b.textContent = 'Relancer';
            b.addEventListener('click', function () { b.disabled = true; api('POST', '/admin/primes/' + p.id + '/relancer').then(charger).catch(function (e) { alert(e.message); b.disabled = false; }); });
            td.appendChild(b);
          }
          liste.appendChild(tr);
        });
        if (!primes.length) { var vide = document.createElement('tr'); cellule(vide, 'Rien à verser.').colSpan = 6; liste.appendChild(vide); }
      });
  }

  function bouton(td, texte, secondaire, action) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = texte; if (secondaire) b.className = 'secondaire';
    b.style.marginRight = '6px';
    b.addEventListener('click', function () { b.disabled = true; Promise.resolve(action()).catch(function (e) { alert(e.message); }).then(function () { b.disabled = false; }); });
    td.appendChild(b); return b;
  }
  function chargerAValider() {
    return api('GET', '/admin/primes?statut=a_valider').then(function (primes) {
      var liste = $('listeAValider'); liste.textContent = '';
      primes.forEach(function (p) {
        var tr = document.createElement('tr');
        cellule(tr, p.pseudo + (p.telephone_verifie ? ' ✔' : ' (numéro non vérifié)')); cellule(tr, p.equipe); cellule(tr, p.rang + 'e'); cellule(tr, dollars(p.montant_centimes) + ' ' + p.devise);
        var td = cellule(tr, '');
        bouton(td, 'Courses', true, function () { return voirCourses(p.joueur_id, p.pseudo); });
        bouton(td, 'Valider', false, function () { return api('POST', '/admin/primes/' + p.id + '/valider').then(chargerAValider); });
        bouton(td, 'Refuser', true, function () {
          var motif = prompt('Motif du refus (visible dans l\'historique) :', 'course suspecte');
          if (!motif) return;
          return api('POST', '/admin/primes/' + p.id + '/refuser', { motif: motif }).then(chargerAValider);
        });
        liste.appendChild(tr);
      });
      if (!primes.length) { var vide = document.createElement('tr'); cellule(vide, 'Aucune prime en attente de validation.').colSpan = 5; liste.appendChild(vide); }
    });
  }
  function voirCourses(id, pseudo) {
    return api('GET', '/admin/joueurs/' + id + '/courses').then(function (courses) {
      var zone = $('detailCourses'); zone.textContent = 'Courses de ' + pseudo + ' : ';
      if (!courses.length) { zone.textContent += 'aucune.'; return; }
      zone.textContent += courses.slice(0, 12).map(function (c) {
        var marge = Math.round((c.temps_ms / c.temps_min_ms - 1) * 100);
        return c.circuit + ' ' + (c.temps_ms / 1000).toFixed(1) + ' s (' + (c.valide ? 'valide, ' + marge + ' % au-dessus du minimum' : 'rejetée : ' + c.motif_rejet) + ')' + (c.valide && marge < 5 ? ' ⚠' : '');
      }).join(' · ');
    });
  }
  $('formRecherche').addEventListener('submit', function (e) {
    e.preventDefault();
    api('GET', '/admin/joueurs?q=' + encodeURIComponent(e.target.q.value.trim())).then(function (joueurs) {
      var liste = $('listeJoueurs'); liste.textContent = '';
      joueurs.forEach(function (j) {
        var tr = document.createElement('tr');
        cellule(tr, j.pseudo); cellule(tr, '+' + j.telephone); cellule(tr, j.pays_code); cellule(tr, (j.bloque ? 'bloqué (' + (j.bloque_motif || '') + ')' : (j.role === 'admin' ? 'admin' : 'actif')) + (j.telephone_verifie ? ' · n° vérifié' : ' · n° non vérifié'));
        var td = cellule(tr, '');
        bouton(td, 'Courses', true, function () { return voirCourses(j.id, j.pseudo); });
        if (j.role !== 'admin') bouton(td, j.bloque ? 'Débloquer' : 'Bloquer', !j.bloque, function () {
          var motif = j.bloque ? '' : prompt('Motif du blocage :', 'triche');
          if (!j.bloque && !motif) return;
          return api('POST', '/admin/joueurs/' + j.id + '/bloquer', { bloque: !j.bloque, motif: motif || undefined })
            .then(function () { $('formRecherche').requestSubmit(); });
        });
        liste.appendChild(tr);
      });
      if (!joueurs.length) { var vide = document.createElement('tr'); cellule(vide, 'Aucun joueur trouvé.').colSpan = 5; liste.appendChild(vide); }
    }).catch(function (err) { alert(err.message); });
  });

  function ouvrir() {
    return api('GET', '/joueurs/moi').then(function (moi) {
      if (moi.role !== 'admin') throw new Error("Ce compte n'est pas administrateur.");
      $('connexion').hidden = true; $('espace').hidden = false;
      return Promise.all([charger(), chargerAValider()]);
    });
  }

  $('formConnexion').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    api('POST', '/joueurs/connexion', { identifiant: f.identifiant.value.trim(), mot_de_passe: f.mot_de_passe.value })
      .then(function (r) { jeton = r.jeton; try { sessionStorage.setItem('gc-admin', jeton); } catch (e2) {} return ouvrir(); })
      .catch(function (err) { dire('msgConnexion', err.message, false); });
  });

  $('formPrimes').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    api('PUT', '/admin/tournois/reglages', {
      prime_semaine_centimes: centimes(f.prime_semaine.value), nb_equipes_primees: parseInt(f.nb_equipes_primees.value, 10) || 0,
      coupe_prime_championne_centimes: centimes(f.coupe_championne.value), coupe_prime_finaliste_centimes: centimes(f.coupe_finaliste.value),
      validation_primes: f.validation_primes.checked,
      invitation_jours_actifs: parseInt(f.invitation_jours_actifs.value, 10), invitation_periode_jours: parseInt(f.invitation_periode_jours.value, 10),
      invitations_sms: f.invitations_sms.checked,
    }).then(function (r) {
      dire('msgPrimes', 'Enregistré : ' + r.nb_equipes_primees + ' × ' + dollars(r.prime_semaine_centimes) + ' par semaine ; Coupe d\'Afrique : ' +
        dollars(r.coupe_prime_championne_centimes) + ' (championne), ' + dollars(r.coupe_prime_finaliste_centimes) + ' (finaliste).', true);
      return charger();
    }).catch(function (err) { dire('msgPrimes', err.message, false); });
  });

  $('formChampionnat').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, circuits = [];
    for (var i = 0; i < 5; i++) circuits.push(f['circuit' + i].value);
    api('POST', '/admin/tournois/championnats', { pays: f.pays.value, nom: f.nom.value.trim(), sponsor: f.sponsor.value.trim(), premier_lundi: f.premier_lundi.value, circuits: circuits,
      nb_equipes: parseInt(f.nb_equipes.value, 10), taille_equipe: parseInt(f.taille_equipe.value, 10), nb_qualifies: parseInt(f.nb_qualifies.value, 10) })
      .then(function (c) { dire('msgChampionnat', 'Championnat créé : ' + c.nom + ', qualifications à partir du ' + f.premier_lundi.value + '.', true); return charger(); })
      .catch(function (err) { dire('msgChampionnat', err.message, false); });
  });

  $('boutonDeconnexion').addEventListener('click', function () {
    jeton = null; try { sessionStorage.removeItem('gc-admin'); } catch (e) {}
    location.reload();
  });

  if (jeton) ouvrir().catch(function () { jeton = null; });
})();
