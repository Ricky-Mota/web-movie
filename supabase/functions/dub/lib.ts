// Professa-M : fonction de doublage (Supabase Edge Function « dub »).
//
// Étapes, appelées une par une par le Studio (site/studio.html) :
//   transcribe : écoute la vidéo (Groq Whisper) et la découpe en passages minutés
//   dub        : traduit les passages dans UNE langue (Gemini) et crée la voix (ElevenLabs)
//   get / list : relit un travail déjà fait, ou la liste des derniers travaux
//
// Réservé aux administrateurs de l'équipe (fonction am_i_crm_admin).
// Clés à enregistrer dans Supabase > Edge Functions > Secrets :
//   GROQ_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY
// Réglages facultatifs : GEMINI_MODEL, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL, ELEVENLABS_MODEL_LOCAL

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const LANGS: Record<string, string> = {
  fr: "French", en: "English", sw: "Swahili", ln: "Lingala", pt: "Portuguese",
  es: "Spanish", ar: "Arabic", de: "German", zh: "Mandarin Chinese (simplified characters)",
  ja: "Japanese", hi: "Hindi", lua: "Tshiluba (Luba-Kasai)", kg: "Kikongo",
};
// Langues que Whisper connaît (sinon : détection automatique)
const WHISPER_LANGS = new Set(["fr", "en", "sw", "ln", "pt", "es", "ar", "de", "zh", "ja", "hi"]);
// Langues africaines : modèle de voix le plus multilingue
const LOCAL_VOICE_LANGS = new Set(["sw", "ln", "lua", "kg"]);

const SOURCE_BUCKET = "translation-uploads";
const DUB_BUCKET = "dubs";
const MAX_BYTES = 25 * 1024 * 1024; // limite de fichier de l'API de transcription
const MAX_SECONDS = 10 * 60;
const SIGN_SECONDS = 6 * 3600;

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const GROQ_URL = () => env("GROQ_BASE_URL", "https://api.groq.com") + "/openai/v1/audio/transcriptions";
const GEMINI_URL = (model: string) =>
  env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com") + `/v1beta/models/${model}:generateContent`;
const ELEVEN_URL = (voice: string) =>
  env("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io") + `/v1/text-to-speech/${voice}?output_format=mp3_44100_64`;

class UserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function requireKey(name: string) {
  const v = env(name);
  if (!v) throw new UserError(`Clé manquante : ajoutez ${name} dans Supabase > Edge Functions > Secrets.`, 503);
  return v;
}

export type Segment = { start: number; end: number; text: string };

// ---------------------------------------------------------------------------
// 1. Transcription (Groq Whisper)
// ---------------------------------------------------------------------------
export async function transcribe(file: Blob, fileName: string, sourceLanguage: string | null) {
  const form = new FormData();
  form.append("file", file, fileName || "video.mp4");
  form.append("model", env("GROQ_MODEL", "whisper-large-v3"));
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (sourceLanguage && WHISPER_LANGS.has(sourceLanguage)) form.append("language", sourceLanguage);

  const res = await fetch(GROQ_URL(), {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey("GROQ_API_KEY")}` },
    body: form,
  });
  if (!res.ok) throw new UserError(`Transcription refusée par Groq (${res.status}) : ${(await res.text()).slice(0, 300)}`, 502);
  const data = await res.json();
  const segments: Segment[] = (data.segments ?? [])
    .map((s: { start: number; end: number; text: string }) => ({
      start: Math.max(0, Number(s.start) || 0),
      end: Math.max(0, Number(s.end) || 0),
      text: String(s.text ?? "").trim(),
    }))
    .filter((s: Segment) => s.text && s.end > s.start);
  if (!segments.length && String(data.text ?? "").trim()) {
    segments.push({ start: 0, end: Number(data.duration) || 1, text: String(data.text).trim() });
  }
  return {
    duration: Number(data.duration) || (segments.length ? segments[segments.length - 1].end : 0),
    detected_language: data.language ?? null,
    segments,
  };
}

// ---------------------------------------------------------------------------
// 2. Traduction (Gemini) : même nombre de passages, phrases courtes pour la voix
// ---------------------------------------------------------------------------
export async function translate(segments: Segment[], target: string, sourceLanguage: string | null) {
  const model = env("GEMINI_MODEL", "gemini-flash-latest");
  const items = segments.map((s, i) => ({ i, seconds: Math.round((s.end - s.start) * 10) / 10, text: s.text }));
  const prompt = [
    `Translate each item into ${LANGS[target]}${sourceLanguage && LANGS[sourceLanguage] ? ` from ${LANGS[sourceLanguage]}` : ""}.`,
    "These are timed subtitle segments of an educational video that will be dubbed by a voice.",
    "Rules: keep the meaning faithful; use simple, natural, spoken language understood by the general public;",
    "keep each translation short enough to be spoken in about the given number of seconds;",
    "keep names, numbers and units; do not add explanations.",
    `Return ONLY a JSON array of exactly ${items.length} strings, in the same order as the items.`,
    "Items:",
    JSON.stringify(items),
  ].join("\n");

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(GEMINI_URL(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": requireKey("GEMINI_API_KEY") },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      lastError = `Traduction refusée par Gemini (${res.status}) : ${(await res.text()).slice(0, 300)}`;
      if (res.status === 429 || res.status >= 500) continue;
      throw new UserError(lastError, 502);
    }
    const data = await res.json();
    const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    try {
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      const arr: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.translations) ? parsed.translations : [];
      if (arr.length === items.length) return arr.map((t) => String(t ?? "").trim());
      lastError = `Gemini a renvoyé ${arr.length} passages au lieu de ${items.length}`;
    } catch {
      lastError = "Réponse de Gemini illisible";
    }
  }
  throw new UserError(lastError || "Traduction impossible", 502);
}

// ---------------------------------------------------------------------------
// 3. Voix (ElevenLabs), deux demandes à la fois (limite de l'offre gratuite)
// ---------------------------------------------------------------------------
export async function speak(text: string, target: string): Promise<Uint8Array> {
  const voice = env("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb");
  const modelId = LOCAL_VOICE_LANGS.has(target)
    ? env("ELEVENLABS_MODEL_LOCAL", "eleven_v3")
    : env("ELEVENLABS_MODEL", "eleven_multilingual_v2");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ELEVEN_URL(voice), {
      method: "POST",
      headers: { "xi-api-key": requireKey("ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: modelId }),
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    throw new UserError(`Voix refusée par ElevenLabs (${res.status}) : ${detail}`, 502);
  }
  throw new UserError("Voix indisponible", 502);
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Stockage des résultats (bucket privé « dubs »)
// ---------------------------------------------------------------------------
async function readJson(admin: SupabaseClient, path: string) {
  const { data, error } = await admin.storage.from(DUB_BUCKET).download(path);
  if (error || !data) throw new UserError("Travail introuvable", 404);
  return JSON.parse(await data.text());
}
async function writeJson(admin: SupabaseClient, path: string, value: unknown) {
  const { error } = await admin.storage.from(DUB_BUCKET)
    .upload(path, new TextEncoder().encode(JSON.stringify(value)), { upsert: true, contentType: "application/json" });
  if (error) throw new Error("Écriture impossible : " + error.message);
}
async function sign(admin: SupabaseClient, bucket: string, paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, SIGN_SECONDS);
  if (error) throw new Error("Liens de lecture impossibles : " + error.message);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
async function withUrls(admin: SupabaseClient, track: { segments: { audio?: string | null }[] }) {
  const urls = await sign(admin, DUB_BUCKET, track.segments.map((s) => s.audio).filter(Boolean) as string[]);
  return { ...track, segments: track.segments.map((s) => ({ ...s, audio_url: s.audio ? urls[s.audio] ?? null : null })) };
}
const validJob = (id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function actionTranscribe(admin: SupabaseClient, body: Record<string, unknown>) {
  const path = String(body.path ?? "");
  if (!path.startsWith("incoming/") || path.includes("..")) throw new UserError("Fichier invalide");
  const src = body.source_language ? String(body.source_language) : null;
  if (src && !LANGS[src]) throw new UserError("Langue de la vidéo inconnue");

  const { data: file, error } = await admin.storage.from(SOURCE_BUCKET).download(path);
  if (error || !file) throw new UserError("Fichier introuvable dans le stockage", 404);
  if (file.size > MAX_BYTES) throw new UserError("Fichier trop lourd pour la transcription (25 Mo maximum)");

  const t = await transcribe(file, String(body.file_name ?? path.split("/").pop()), src);
  if (!t.segments.length) throw new UserError("Aucune parole détectée dans cette vidéo");
  if (t.duration > MAX_SECONDS) throw new UserError("Vidéo trop longue pour le test (10 minutes maximum)");

  const job = {
    job_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    source_path: path,
    file_name: String(body.file_name ?? ""),
    source_language: src ?? t.detected_language,
    duration: t.duration,
    segments: t.segments,
  };
  await writeJson(admin, `${job.job_id}/transcript.json`, job);
  const urls = await sign(admin, SOURCE_BUCKET, [path]);
  return { ...job, source_url: urls[path] ?? null, tracks: [] };
}

async function actionDub(admin: SupabaseClient, body: Record<string, unknown>) {
  if (!validJob(body.job_id)) throw new UserError("Travail invalide");
  const target = String(body.target ?? "");
  if (!LANGS[target]) throw new UserError("Langue cible inconnue");
  const voice = body.voice !== false;
  const job = await readJson(admin, `${body.job_id}/transcript.json`);
  if (target === job.source_language) throw new UserError("La langue cible est celle de la vidéo");

  const texts = await translate(job.segments, target, job.source_language);
  const segments = job.segments.map((s: Segment, i: number) => ({ start: s.start, end: s.end, source: s.text, text: texts[i], audio: null as string | null }));

  if (voice) {
    await mapLimit(segments, 2, async (s: { text: string; audio: string | null }, i: number) => {
      if (!s.text) return;
      const audio = await speak(s.text, target);
      const p = `${job.job_id}/${target}/${String(i).padStart(4, "0")}.mp3`;
      const { error } = await admin.storage.from(DUB_BUCKET).upload(p, audio, { upsert: true, contentType: "audio/mpeg" });
      if (error) throw new Error("Enregistrement de la voix impossible : " + error.message);
      s.audio = p;
    });
  }
  const track = { language: target, voice, created_at: new Date().toISOString(), segments };
  await writeJson(admin, `${job.job_id}/${target}.json`, track);
  return withUrls(admin, track);
}

async function actionGet(admin: SupabaseClient, body: Record<string, unknown>) {
  if (!validJob(body.job_id)) throw new UserError("Travail invalide");
  const job = await readJson(admin, `${body.job_id}/transcript.json`);
  const { data: files } = await admin.storage.from(DUB_BUCKET).list(job.job_id, { limit: 100 });
  const langs = (files ?? []).map((f) => f.name).filter((n) => n.endsWith(".json") && n !== "transcript.json").map((n) => n.replace(/\.json$/, ""));
  const tracks = [];
  for (const l of langs) tracks.push(await withUrls(admin, await readJson(admin, `${job.job_id}/${l}.json`)));
  const urls = await sign(admin, SOURCE_BUCKET, [job.source_path]);
  return { ...job, source_url: urls[job.source_path] ?? null, tracks };
}

async function actionList(admin: SupabaseClient) {
  const { data: folders } = await admin.storage.from(DUB_BUCKET).list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
  const jobs = [];
  for (const f of folders ?? []) {
    if (!validJob(f.name)) continue;
    try {
      const j = await readJson(admin, `${f.name}/transcript.json`);
      jobs.push({ job_id: j.job_id, created_at: j.created_at, file_name: j.file_name, duration: j.duration, source_language: j.source_language });
    } catch { /* dossier incomplet */ }
  }
  jobs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { jobs: jobs.slice(0, 30) };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  try {
    const url = env("SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY"), anon = env("SUPABASE_ANON_KEY") || service;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: isAdmin, error: authError } = await userClient.rpc("am_i_crm_admin");
    if (authError || isAdmin !== true) return json({ error: "Accès réservé à l'équipe Professa-M" }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "transcribe": return json(await actionTranscribe(admin, body));
      case "dub": return json(await actionDub(admin, body));
      case "get": return json(await actionGet(admin, body));
      case "list": return json(await actionList(admin));
      default: return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Erreur interne : " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
}


