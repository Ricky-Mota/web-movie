// Test local : deno run -A supabase/functions/dub/lib_test.ts (faux services, aucune clé réelle).
// Test local de la fonction « dub » avec de faux services (Supabase, Groq, Gemini, ElevenLabs).
const files = new Map<string, Uint8Array>();          // "bucket/path" -> octets
const calls: string[] = [];
files.set("translation-uploads/incoming/test.mp4", new Uint8Array(1000));

const server = Deno.serve({ port: 54329, onListen() {} }, async (req) => {
  const u = new URL(req.url); const p = decodeURIComponent(u.pathname);
  const auth = req.headers.get("authorization") ?? "";
  if (p === "/rest/v1/rpc/am_i_crm_admin") return Response.json(auth === "Bearer admin-token");
  if (p.startsWith("/storage/v1/object/list/")) {
    const bucket = p.slice("/storage/v1/object/list/".length); const { prefix } = await req.json();
    const pre = bucket + "/" + (prefix ? prefix + "/" : "");
    const names = new Set<string>();
    for (const k of files.keys()) if (k.startsWith(pre)) names.add(k.slice(pre.length).split("/")[0]);
    return Response.json([...names].map((name) => ({ name, id: name.includes(".") ? "x" : null })));
  }
  if (p.startsWith("/storage/v1/object/sign/")) {
    const bucket = p.slice("/storage/v1/object/sign/".length); const { paths } = await req.json();
    return Response.json(paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=t`, error: null })));
  }
  if (p.startsWith("/storage/v1/object/")) {
    const key = p.slice("/storage/v1/object/".length);
    if (req.method === "GET") { const f = files.get(key); return f ? new Response(f) : Response.json({ error: "not found" }, { status: 400 }); }
    if (req.method === "POST" || req.method === "PUT") {
      const ct = req.headers.get("content-type") ?? "";
      let bytes: Uint8Array;
      if (ct.includes("multipart/form-data")) { const fd = await req.formData(); const vals = [...fd.entries()]; const f = vals.map((e) => e[1]).find((v) => typeof v !== "string") as Blob | undefined;
        bytes = f ? new Uint8Array(await f.arrayBuffer()) : new TextEncoder().encode(String(vals[vals.length - 1]?.[1] ?? "")); calls.push("upload-fields " + vals.map((e) => e[0] + ":" + (typeof e[1])).join(",")); }
      else bytes = new Uint8Array(await req.arrayBuffer());
      files.set(key, bytes); return Response.json({ Key: key });
    }
  }
  if (p === "/openai/v1/audio/transcriptions") {
    calls.push("groq " + (auth === "Bearer gk" ? "ok" : "BADKEY"));
    const fd = await req.formData(); calls.push("groq lang=" + fd.get("language") + " model=" + fd.get("model"));
    return Response.json({ language: "french", duration: 12.5, text: "...", segments: [
      { start: 0, end: 4, text: " Faites bouillir l'eau." }, { start: 4.2, end: 8, text: " Lavez-vous les mains." }, { start: 8.1, end: 12.4, text: " Couvrez la nourriture." }] });
  }
  if (p.startsWith("/v1beta/models/")) {
    calls.push("gemini " + p.split("/").pop() + " key=" + req.headers.get("x-goog-api-key"));
    const body = await req.json(); const items = JSON.parse(body.contents[0].parts[0].text.split("Items:\n")[1]);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(items.map((x: { text: string }) => "[T] " + x.text)) }] } }] });
  }
  if (p.startsWith("/v1/text-to-speech/")) {
    const b = await req.json(); calls.push("eleven " + b.model_id + " " + (req.headers.get("xi-api-key") === "ek" ? "ok" : "BADKEY"));
    return new Response(new TextEncoder().encode("MP3:" + b.text), { headers: { "content-type": "audio/mpeg" } });
  }
  return Response.json({ error: "non simulé " + p }, { status: 404 });
});

const base = "http://localhost:54329";
Deno.env.set("SUPABASE_URL", base); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service"); Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("GROQ_BASE_URL", base); Deno.env.set("GEMINI_BASE_URL", base); Deno.env.set("ELEVENLABS_BASE_URL", base);
const { handle } = await import("./lib.ts");
const call = async (body: unknown, token = "admin-token") => {
  const r = await handle(new Request("http://f/dub", { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
let ok = 0; const check = (c: boolean, m: string) => { if (!c) throw new Error("ECHEC : " + m); ok++; };

let r = await call({ action: "list" }, "visitor");
check(r.status === 403, "visiteur refusé");
r = await call({ action: "transcribe", path: "incoming/test.mp4", source_language: "fr" });
check(r.status === 503 && r.body.error.includes("GROQ_API_KEY"), "clé Groq manquante signalée : " + JSON.stringify(r.body));
Deno.env.set("GROQ_API_KEY", "gk"); Deno.env.set("GEMINI_API_KEY", "gemk"); Deno.env.set("ELEVENLABS_API_KEY", "ek");
r = await call({ action: "transcribe", path: "../secret", source_language: "fr" });
check(r.status === 400, "chemin hors dossier refusé");
r = await call({ action: "transcribe", path: "incoming/test.mp4", source_language: "fr", file_name: "test.mp4" });
check(r.status === 200 && r.body.segments.length === 3 && r.body.segments[0].text === "Faites bouillir l'eau.", "transcription : " + JSON.stringify(r.body).slice(0, 200));
check(String(r.body.source_url).includes("/storage/v1/object/sign/translation-uploads/incoming/test.mp4"), "lien de la vidéo source");
const job = r.body.job_id;

r = await call({ action: "dub", job_id: job, target: "ln" });
check(r.status === 200 && r.body.segments.length === 3 && r.body.segments[1].text === "[T] Lavez-vous les mains.", "doublage lingala : " + JSON.stringify(r.body).slice(0, 300));
check(r.body.segments.every((s: { audio_url: string }) => s.audio_url && s.audio_url.includes("/dubs/")), "liens audio");
check(new TextDecoder().decode(files.get(`dubs/${job}/ln/0000.mp3`)) === "MP3:[T] Faites bouillir l'eau.", "audio enregistré");
r = await call({ action: "dub", job_id: job, target: "en", voice: false });
check(r.status === 200 && r.body.segments.every((s: { audio: unknown }) => s.audio === null), "sous-titres seuls sans voix");
r = await call({ action: "dub", job_id: job, target: "fr" });
check(r.status === 400, "langue identique refusée");
r = await call({ action: "get", job_id: job });
check(r.status === 200 && r.body.tracks.map((t: { language: string }) => t.language).sort().join() === "en,ln", "relecture du travail : " + JSON.stringify(r.body.tracks?.map((t: { language: string }) => t.language)));
r = await call({ action: "list" });
check(r.status === 200 && r.body.jobs.length === 1 && r.body.jobs[0].job_id === job, "liste des travaux");
check(calls.includes("eleven eleven_v3 ok") && !calls.some((c) => c.includes("BADKEY")), "modèle de voix africain et clés envoyées");
check(calls.some((c) => c.startsWith("groq lang=fr model=whisper-large-v3")), "langue envoyée à Whisper");
console.log("RESULTAT : " + ok + " vérifications réussies");
console.log(calls.join("\n"));
await server.shutdown();
