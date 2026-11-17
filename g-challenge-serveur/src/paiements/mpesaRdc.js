// Vodacom M-Pesa RDC, via l'Open API M-Pesa (marché "vodacomDRC").
// - encaisser : C2B "single stage" -> le joueur reçoit une demande sur son téléphone et tape son code PIN.
// - verser    : B2C -> le gain part sur le compte M-Pesa du joueur.
//
// À VALIDER avec la documentation et les clés fournies par Vodacom RDC lors de l'ouverture
// du compte marchand : URL, noms de champs et codes de réponse peuvent différer selon le contrat.
// Rien ici n'a été testé contre la vraie API : faites d'abord vos essais sur le "sandbox".
import { publicEncrypt, constants } from 'node:crypto';
import { config } from '../config.js';
import { centimesVersTexte } from '../domaine/argent.js';

const SUCCES = 'INS-0';
let session = null; // { id, obtenueLe }

function chiffrer(texte) {
  const brute = config.mpesaRdc.clePublique.replace(/\s+/g, '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${brute.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(texte)).toString('base64');
}

async function appeler(methode, chemin, jeton, corps) {
  const reponse = await fetch(`${config.mpesaRdc.baseUrl}${chemin}`, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      Origin: config.mpesaRdc.origine,
      Authorization: `Bearer ${chiffrer(jeton)}`,
    },
    body: corps ? JSON.stringify(corps) : undefined,
    // Le C2B attend que le joueur tape son PIN : on laisse jusqu'à 2 minutes.
    signal: AbortSignal.timeout(120_000),
  });
  const json = await reponse.json().catch(() => ({}));
  return { http: reponse.status, json };
}

async function obtenirSession() {
  // Une session reste valable plusieurs heures ; on la renouvelle toutes les heures.
  if (session && Date.now() - session.obtenueLe < 60 * 60 * 1000) return session.id;
  const { json } = await appeler('GET', '/getSession/', config.mpesaRdc.apiKey);
  if (json.output_ResponseCode !== SUCCES) {
    throw new Error(`Session M-Pesa refusée : ${json.output_ResponseDesc || 'réponse inconnue'}`);
  }
  session = { id: json.output_SessionID, obtenueLe: Date.now() };
  // La documentation indique qu'une nouvelle session met quelques secondes à devenir active.
  await new Promise((r) => setTimeout(r, 30_000));
  return session.id;
}

function resultat(json) {
  return {
    statut: json.output_ResponseCode === SUCCES ? 'reussi' : 'echoue',
    reference: json.output_TransactionID || null,
    details: { code: json.output_ResponseCode, description: json.output_ResponseDesc },
  };
}

function corpsCommun(paiement, joueur) {
  return {
    input_Amount: centimesVersTexte(paiement.montant_centimes),
    input_Country: 'DRC',
    input_Currency: paiement.devise,
    input_CustomerMSISDN: joueur.telephone,
    input_ServiceProviderCode: config.mpesaRdc.codeFournisseur,
    input_ThirdPartyConversationID: paiement.id.replace(/-/g, ''),
    input_TransactionReference: paiement.id.slice(0, 20).replace(/-/g, ''),
  };
}

export const mpesaRdc = {
  nom: 'mpesa_rdc',
  async encaisser(paiement, joueur) {
    const id = await obtenirSession();
    const { json } = await appeler('POST', '/c2bPayment/singleStage/', id, {
      ...corpsCommun(paiement, joueur),
      input_PurchasedItemsDesc: 'Mise G-Challenge',
    });
    return resultat(json);
  },
  async verser(paiement, joueur) {
    const id = await obtenirSession();
    const { json } = await appeler('POST', '/b2cPayment/', id, {
      ...corpsCommun(paiement, joueur),
      input_PaymentItemsDesc: paiement.sens === 'remboursement' ? 'Remboursement G-Challenge' : 'Gain G-Challenge',
    });
    return resultat(json);
  },
};
