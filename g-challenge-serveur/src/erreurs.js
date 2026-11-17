export class ErreurApi extends Error {
  constructor(statut, code, message) {
    super(message);
    this.statut = statut;
    this.code = code;
  }
}

export const refus = (code, message) => new ErreurApi(400, code, message);
export const interdit = (code, message) => new ErreurApi(403, code, message);
export const introuvable = (message) => new ErreurApi(404, 'introuvable', message);
export const conflit = (code, message) => new ErreurApi(409, code, message);

/** Valide req.body avec un schéma zod, ou renvoie une erreur 400 lisible. */
export function valider(schema, donnees) {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`).join(' ; ');
    throw refus('donnees_invalides', detail);
  }
  return r.data;
}
