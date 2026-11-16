import pg from 'pg';
import { config } from './config.js';

// Les bigint (montants en centimes) reviennent en nombres JavaScript.
// Sûr jusqu'à 90 000 milliards de centimes.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Certificat de la base vérifié (Neon a un certificat public valide) : empêche une fausse base
  // de s'intercaler. DATABASE_SSL_SANS_VERIFICATION=true seulement pour une base au certificat maison.
  ssl: config.databaseSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_SANS_VERIFICATION !== 'true' } : undefined,
  max: 10,
  options: '-c search_path=gchallenge',
});

export function requete(texte, valeurs) {
  return pool.query(texte, valeurs);
}

/** Exécute fn(client) dans une transaction : tout réussit, ou rien n'est écrit. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await client.query('ROLLBACK');
    throw erreur;
  } finally {
    client.release();
  }
}
