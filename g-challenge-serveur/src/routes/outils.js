/** Express 4 n'attrape pas les erreurs des fonctions async : ce petit enrobage s'en charge. */
export const asynchrone = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
