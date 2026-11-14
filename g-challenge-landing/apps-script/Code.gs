/**
 * À coller dans le Google Sheet « G-Challenge – Inscriptions bêta » :
 * Extensions > Apps Script. Voir le README du dossier g-challenge-landing.
 *
 * Ajoute une ligne par inscription, dans les colonnes que lit le CRM :
 * A Date · B Telephone · C Pseudo · D Plateforme · E Source
 */
function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return repondre({ statut: 'erreur', message: 'json_invalide' });
  }

  var jeton = PropertiesService.getScriptProperties().getProperty('JETON');
  if (!jeton || d.jeton !== jeton) return repondre({ statut: 'erreur', message: 'jeton_invalide' });

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
    feuille.appendRow([d.date, "'" + telephone, d.pseudo || '', d.plateforme || 'Android', d.source || 'landing']);
  } finally {
    verrou.releaseLock();
  }
  return repondre({ statut: 'inscrit' });
}

function chiffres(t) {
  return String(t).replace(/\D/g, '');
}

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}
