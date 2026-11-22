// Zboss-speed — configuration
// Laisse ces deux valeurs vides pour le « mode démo » : les inscriptions sont
// alors gardées dans le navigateur (pratique pour tester, pas pour la production).
// Pour la production, colle ici l'URL et la clé publique (publishable / anon) de
// ton projet Supabase. Ces deux valeurs sont faites pour être publiques : la
// sécurité vient des règles RLS de supabase/schema.sql.
window.ZBOSS_CONFIG = {
  SUPABASE_URL: "",        // ex. "https://abcd1234.supabase.co"
  SUPABASE_ANON_KEY: "",   // ex. "sb_publishable_..." ou la clé "anon"
};
