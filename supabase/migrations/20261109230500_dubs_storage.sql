-- Espace de stockage privé des doublages (transcriptions, traductions, voix).
-- Seule la fonction « dub » y écrit et y lit (clé de service) ; le Studio reçoit des liens signés.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dubs', 'dubs', false, 10485760, array['audio/mpeg', 'application/json'])
on conflict (id) do nothing;
