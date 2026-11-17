// Envoi des SMS (codes de vérification). Fournisseur choisi par SMS_FOURNISSEUR :
//   simulation     : aucun SMS, le code est écrit dans le journal du serveur (essais uniquement)
//   twilio         : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, et TWILIO_FROM (numéro) ou TWILIO_MESSAGING_SERVICE_SID
//   africastalking : AT_USERNAME, AT_API_KEY, AT_EXPEDITEUR (facultatif) ; AT_USERNAME=sandbox pour les essais
// Les clés vont dans les variables d'environnement de Render, jamais dans le code.
const derniersCodes = new Map(); // pour les tests automatiques (fournisseur simulation)

const simulation = {
  nom: 'simulation',
  async envoyer(telephone, texte) {
    derniersCodes.set(telephone, texte);
    console.log(`[SMS simulé] +${telephone} : ${texte}`);
    return { ok: true };
  },
};

const twilio = {
  nom: 'twilio',
  async envoyer(telephone, texte) {
    const sid = process.env.TWILIO_ACCOUNT_SID, jeton = process.env.TWILIO_AUTH_TOKEN;
    const corps = new URLSearchParams({ To: '+' + telephone, Body: texte });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) corps.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else corps.set('From', process.env.TWILIO_FROM || '');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${jeton}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps, signal: AbortSignal.timeout(15_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Twilio : ${j.message || r.status}`);
    return { ok: true, reference: j.sid };
  },
};

const africastalking = {
  nom: 'africastalking',
  async envoyer(telephone, texte) {
    const utilisateur = process.env.AT_USERNAME;
    const hote = utilisateur === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const corps = new URLSearchParams({ username: utilisateur, to: '+' + telephone, message: texte });
    if (process.env.AT_EXPEDITEUR) corps.set('from', process.env.AT_EXPEDITEUR);
    const r = await fetch(`https://${hote}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: process.env.AT_API_KEY || '', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps, signal: AbortSignal.timeout(15_000),
    });
    const j = await r.json().catch(() => ({}));
    const dest = j.SMSMessageData?.Recipients?.[0];
    if (!r.ok || !dest || !/^Success$/i.test(dest.status)) throw new Error(`Africa's Talking : ${dest?.status || j.SMSMessageData?.Message || r.status}`);
    return { ok: true, reference: dest.messageId };
  },
};

const fournisseurs = { simulation, twilio, africastalking };

export function fournisseurSms() {
  const nom = process.env.SMS_FOURNISSEUR || 'simulation';
  const f = fournisseurs[nom];
  if (!f) throw new Error(`Fournisseur SMS inconnu : ${nom}`);
  return f;
}

export const _derniersCodes = derniersCodes;
