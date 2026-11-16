/**
 * À coller dans le Google Sheet « G-Challenge – Inscriptions bêta » :
 * Extensions > Apps Script. Voir le README du dossier g-challenge-landing.
 *
 * Ajoute une ligne par inscription, dans les colonnes que lit le CRM :
 * A Date · B Telephone · C Pseudo · D Plateforme · E Source
 *
 * L'adresse de l'application Web (…/exec) sert de clé : elle n'est connue que
 * de l'hébergeur de la landing page (Cloudflare ou Netlify). Ne la publiez nulle part ailleurs.
 */
function doPost(e) {
  var d;
  if (!e || !e.postData || String(e.postData.contents).length > 4000) return repondre({ statut: 'erreur', message: 'trop_gros' });
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return repondre({ statut: 'erreur', message: 'json_invalide' });
  }

  var telephone = String(d.telephone || '');
  if (!/^\+\d{8,15}$/.test(telephone)) return repondre({ statut: 'erreur', message: 'telephone_invalide' });

  var verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var derniere = feuille.getLastRow();
    if (derniere >= 2) {
      var numeros = feuille.getRange(2, 2, derniere - 1, 1).getDisplayValues();
      var cible = chiffres(telephone);
      for (var i = 0; i < numeros.length; i++) {
        if (chiffres(numeros[i][0]) === cible) return repondre({ statut: 'deja_inscrit' });
      }
    }
    // L'apostrophe force le texte : sinon Google Sheets transforme "+243..." en nombre.
    // Chaque texte est nettoyé : une cellule qui commence par = + - @ serait exécutée comme une formule
    // par Google Sheets (« injection de formule ») ; on ne garde que lettres, chiffres et quelques signes.
    var date = Utilities.formatDate(new Date(), 'Africa/Kinshasa', 'yyyy-MM-dd');
    var plateforme = ['Android', 'iOS', 'PC'].indexOf(d.plateforme) >= 0 ? d.plateforme : 'Android';
    feuille.appendRow([date, "'" + telephone, propre(d.pseudo, 20), plateforme, propre(d.source, 40) || 'landing']);
  } finally {
    verrou.releaseLock();
  }
  return repondre({ statut: 'inscrit' });
}

function propre(texte, max) {
  return String(texte || '').replace(/[^\p{L}\p{N}_. -]/gu, '').replace(/^[-\s.]+/, '').slice(0, max);
}

function chiffres(t) {
  return String(t).replace(/\D/g, '');
}

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}
