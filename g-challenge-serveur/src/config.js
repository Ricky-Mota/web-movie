import 'dotenv/config';

function lire(nom, defaut) {
  const valeur = process.env[nom] ?? defaut;
  if (valeur === undefined) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return valeur;
}

export const config = {
  port: Number(lire('PORT', '3000')),
  databaseUrl: lire('DATABASE_URL'),
  databaseSsl: lire('DATABASE_SSL', 'false') === 'true',
  jwtSecret: lire('JWT_SECRET'),
  jwtDuree: lire('JWT_DUREE', '30d'),
  // "simulation" remplace tous les fournisseurs : aucun argent réel ne bouge.
  fournisseurForce: process.env.FOURNISSEUR_FORCE || null,
  delaiRejoindreMinutes: Number(lire('DELAI_REJOINDRE_MINUTES', '60')),
  delaiCourirMinutes: Number(lire('DELAI_COURIR_MINUTES', '30')),
  urlPublique: lire('URL_PUBLIQUE', 'http://localhost:3000'),
  mpesaRdc: {
    baseUrl: process.env.MPESA_RDC_BASE_URL || 'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomDRC',
    apiKey: process.env.MPESA_RDC_API_KEY || '',
    clePublique: process.env.MPESA_RDC_CLE_PUBLIQUE || '',
    codeFournisseur: process.env.MPESA_RDC_CODE_SERVICE || '',
    origine: process.env.MPESA_RDC_ORIGINE || '*',
  },
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
}
