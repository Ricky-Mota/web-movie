import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dossier = fileURLToPath(new URL('../db/migrations/', import.meta.url));

/** Applique dans l'ordre les fichiers .sql pas encore passés. */
export async function migrer() {
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS gchallenge');
    await client.query(`CREATE TABLE IF NOT EXISTS gchallenge.migrations (
      nom text PRIMARY KEY, appliquee_le timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT nom FROM gchallenge.migrations');
    const deja = new Set(rows.map((r) => r.nom));
    const fichiers = (await readdir(dossier)).filter((f) => f.endsWith('.sql')).sort();
    const appliquees = [];
    for (const fichier of fichiers) {
      if (deja.has(fichier)) continue;
      const sql = await readFile(dossier + fichier, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO gchallenge.migrations (nom) VALUES ($1)', [fichier]);
        await client.query('COMMIT');
        appliquees.push(fichier);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${fichier} échouée : ${e.message}`);
      }
    }
    return appliquees;
  } finally {
    client.release();
  }
}
