import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compose, contextualTrackGenerationSchema } from "../lib/domain.ts";
import {
  AceStepMusicProvider,
  ElevenLabsMusicProvider,
  MiniMaxMusicProvider,
  MockMusicProvider,
  createProvider,
} from "../lib/providers.ts";
import { InlineTestGenerationQueue } from "../lib/generation-queue.ts";
import { validateElevenLabsPolicy } from "../lib/provider-policy.ts";
test("generation status GET is observational only", async () => {
  const source = await readFile(
    new URL("../app/api/generations/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\.generate\(|orchestrator\.process|\.put\(/);
  assert.match(source, /select j\.id/);
});
test("Worker routes pass the PostgreSQL binding through authentication", async () => {
  const files = [
    "auth/register",
    "auth/login",
    "auth/logout",
    "auth/session",
    "generations",
    "generations/[id]",
    "audio/[id]",
    "songs/[id]",
    "songs/[id]/versions/[versionId]/separation",
    "songs/[id]/versions/[versionId]/mix",
    "vocal-profiles",
    "vocal-profiles/[id]/challenge",
    "vocal-profiles/[id]/challenge/[verificationId]/recording",
    "vocal-profiles/[id]/singing-sources",
    "vocal-repairs",
    "vocal-repairs/import-source",
    "vocal-repairs/[id]/candidates",
    "vocal-repairs/[id]/source",
    "vocal-repairs/[id]/select",
    "vocal-repairs/[id]/render",
  ];
  for (const file of files) {
    const source = await readFile(
      new URL(`../app/api/${file}/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(source, /env|bindings/);
    assert.match(source, /DATABASE_URL/);
  }
});
test("private audio materializes R2 ranges before browser playback", async () => {
  const route = await readFile(
    new URL("../app/api/audio/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /owner_id=\$\{user\.id\}/);
  assert.match(route, /range: \{ offset: start, length: end - start \+ 1 \}/);
  assert.match(route, /await object\.arrayBuffer\(\)/);
  assert.doesNotMatch(route, /new Response\(object\.body/);
});
test("local queue executes without any status read", async () => {
  let delivered = "";
  const queue = new InlineTestGenerationQueue(async (id) => {
    delivered = id;
  });
  await queue.enqueue("job-1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(delivered, "job-1");
});
test("mock provider supports one aligned master and six aligned assets", async () => {
  const input = {
      prompt: "warm reflective soul performance",
      durationSeconds: 1,
      outputMode: "MULTI_ASSET" as const,
      lyrics: "",
      instrumental: false,
    },
    plan = compose(input),
    provider = new MockMusicProvider(),
    base = {
      jobId: "j",
      userId: "u",
      songId: "s",
      versionId: "v",
      compositionPlan: plan,
      seed: 42,
    };
  const multi = await provider.generate({ ...base, outputMode: "MULTI_ASSET" });
  assert.equal(multi.assets.length, 6);
  assert.equal(
    multi.assets.filter((a) => a.role === "MASTER" && a.isPrimary).length,
    1,
  );
  assert.ok(multi.assets.every((a) => a.metadata.durationSeconds === 1));
  const single = await provider.generate({
    ...base,
    outputMode: "MASTER_ONLY",
  });
  assert.deepEqual(
    single.assets.map((a) => a.role),
    ["MASTER"],
  );
});
test("PostgreSQL schema encodes idempotency and normalized assets", async () => {
  const migration = await readFile(
    new URL("../drizzle-pg/0000_condemned_silhouette.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE "version_assets"/);
  assert.match(migration, /jobs_user_idempotency_unique/);
  assert.match(migration, /versions_job_unique/);
  assert.match(migration, /parent_version_id/);
});
test("contextual track lineage is relational", async () => {
  const migration = await readFile(
    new URL("../drizzle-pg/0004_freezing_lester.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /track_generation_method/);
  assert.match(migration, /source_asset_id/);
  assert.match(migration, /LEGO_CONTEXTUAL/);
  assert.match(migration, /version_assets_source_asset_id_audio_assets_id_fk/);
});
test("artist vocal identity is private, verified, versioned, and relational", async () => {
  const [schema, migration, decision] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle-pg/0005_chief_runaways.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../docs/decisions/0004-private-artist-vocal-identity.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const table of [
    "artist_vocal_profiles",
    "vocal_profile_sources",
    "vocal_identity_verifications",
    "vocal_profile_versions",
    "vocal_profile_training_jobs",
  ])
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(
    schema,
    /isPrivate:boolean\("is_private"\)\.notNull\(\)\.default\(true\)/,
  );
  assert.match(migration, /challenge_hash/);
  assert.doesNotMatch(migration, /challenge_text/);
  assert.match(migration, /jobs_vocal_profile_version_fk/);
  assert.match(migration, /versions_vocal_profile_version_fk/);
  assert.match(migration, /vocal_training_profile_version_fk/);
  assert.match(migration, /vocal_profiles_quality_range/);
  assert.match(decision, /speech cloning alone/);
  assert.match(decision, /private, non-transferable, and revocable/);
});
test("vocal profile enrollment starts private and remains owner scoped", async () => {
  const route = await readFile(
      new URL("../app/api/vocal-profiles/route.ts", import.meta.url),
      "utf8",
    ),
    studio = await readFile(
      new URL("../app/studio-app.tsx", import.meta.url),
      "utf8",
    );
  assert.match(route, /requireUser/);
  assert.match(route, /where p\.owner_id=\$\{user\.id\}/);
  assert.match(
    route,
    /values\(\$\{user\.id\},\$\{input\.data\.name\},'DRAFT',true\)/,
  );
  assert.doesNotMatch(route, /ACTIVE',true/);
  assert.match(
    studio,
    /Creating a profile does not clone or\s+publish your voice/,
  );
  assert.match(studio, /10 minutes of clean singing/);
});
test("live vocal challenge requires consent, expires, and persists only a hash", async () => {
  const route = await readFile(
    new URL(
      "../app/api/vocal-profiles/[id]/challenge/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /rightsAttested:z\.literal\(true\)/);
  assert.match(route, /consentAccepted:z\.literal\(true\)/);
  assert.match(route, /challengeHash=await sha256/);
  assert.match(route, /Date\.now\(\)\+10\*60\*1000/);
  assert.match(
    route,
    /insert into vocal_identity_verifications\(id,profile_id,challenge_hash/,
  );
  assert.doesNotMatch(
    route,
    /insert into vocal_identity_verifications[^`]*phrase/,
  );
  assert.match(route, /where id=\$\{id\} and owner_id=\$\{user\.id\}/);
});
test("ready profiles can request a fresh identity phrase", async () => {
  const studio = await readFile(
      new URL("../app/studio-app.tsx", import.meta.url),
      "utf8",
    ),
    route = await readFile(
      new URL(
        "../app/api/vocal-profiles/[id]/challenge/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
  assert.match(studio, /Redo identity phrase/);
  assert.match(studio, /onClick=\{\(\) => void beginEnrollment\(p\.id\)\}/);
  assert.match(route, /profile\.status==="REVOKED"/);
  assert.doesNotMatch(route, /profile\.status!=="DRAFT"/);
});
test("identity recording upload is private, bounded, and verified locally", async () => {
  const route = await readFile(
      new URL(
        "../app/api/vocal-profiles/[id]/challenge/[verificationId]/recording/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    studio = await readFile(
      new URL("../app/studio-app.tsx", import.meta.url),
      "utf8",
    );
  assert.match(route, /p\.owner_id=\$\{user\.id\}/);
  assert.match(route, /durationSeconds<8\|\|durationSeconds>20/);
  assert.match(route, /submittedHash!==verification\.challengeHash/);
  assert.match(route, /await bindings\.AUDIO\.put/);
  assert.match(route, /source_type,original_filename/);
  assert.match(route, /'LIVE_SPEECH'/);
  assert.match(route, /\/v1\/identity-verification/);
  assert.match(route, /expectedPhrase:phrase/);
  assert.match(route, /phrase_match_score/);
  assert.match(route, /analysisStatus:identityAnalysis\.passed\?"PASSED":"REJECTED"/);
  assert.doesNotMatch(route, /transcription:/);
  assert.match(studio, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(studio, /echoCancellation:\s*false/);
});
test("guided singing is stored separately and cannot count as usable before analysis", async () => {
  const route = await readFile(
      new URL(
        "../app/api/vocal-profiles/[id]/singing-sources/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    studio = await readFile(
      new URL("../app/studio-app.tsx", import.meta.url),
      "utf8",
    );
  assert.match(route, /owner_id=\$\{user\.id\}/);
  assert.match(route, /maximumDuration=sourceType==="OWNED_VOCAL_BOUNCE"\?1200:90/);
  assert.match(route, /minimumDuration=sourceType==="OWNED_VOCAL_BOUNCE"\?5:15/);
  assert.match(route, /durationSeconds<minimumDuration\|\|durationSeconds>maximumDuration/);
  assert.match(route, /"LIVE_SINGING"/);
  assert.match(route, /duration_seconds,usable_duration_seconds/);
  assert.match(route, /\$\{durationSeconds\},0,true/);
  assert.match(route, /analysisStatus:"PENDING"/);
  assert.match(studio, /startRecording\("singing", p\.id\)/);
  assert.match(studio, /maximumSeconds = kind === "identity" \? 15 : 60/);
});
test("vocal capture routes one hardware channel to both sides and requires local review", async () => {
  const studio = await readFile(
    new URL("../app/studio-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(studio, /navigator\.mediaDevices\.enumerateDevices/);
  assert.match(studio, /aria-label="Microphone input"/);
  assert.match(studio, /aria-label="Hardware input channel"/);
  assert.match(studio, /createChannelSplitter\(2\)/);
  assert.match(studio, /splitter\.connect\(merger, inputChannel - 1, 0\)/);
  assert.match(studio, /splitter\.connect\(merger, inputChannel - 1, 1\)/);
  assert.match(studio, /aria-label="Live input level"/);
  assert.match(studio, /REVIEW BEFORE UPLOAD/);
  assert.match(studio, /Keep recording/);
  assert.match(studio, /Discard/);
  assert.match(studio, /URL\.createObjectURL\(blob\)/);
});
test("vocal phrase repairs are private, version-bound, and non-destructive", async () => {
  const [schema, migration, renderMigration, route, importedSource, candidates, source, selection, render, studio] =
    await Promise.all([
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle-pg/0006_cooing_quasar.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../drizzle-pg/0007_groovy_supreme_intelligence.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/vocal-repairs/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/vocal-repairs/import-source/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/vocal-repairs/[id]/candidates/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/vocal-repairs/[id]/source/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/vocal-repairs/[id]/select/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/vocal-repairs/[id]/render/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/studio-app.tsx", import.meta.url), "utf8"),
    ]);
  assert.match(schema, /vocalRepairSessions/);
  assert.match(schema, /vocalRepairCandidates/);
  assert.match(migration, /CREATE TABLE "vocal_repair_sessions"/);
  assert.match(migration, /CREATE TABLE "vocal_repair_candidates"/);
  assert.match(migration, /vocal_repairs_region_valid/);
  assert.match(migration, /vocal_repair_one_selected_candidate/);
  assert.match(renderMigration, /source_vocal_asset_id/);
  assert.match(renderMigration, /rendered_audio_asset_id/);
  assert.match(renderMigration, /VOCAL_REPAIR/);
  assert.match(route, /requireUser/);
  assert.match(route, /source_version_id/);
  assert.match(route, /owner_id=\$\{user\.id\}/);
  assert.match(route, /verified_at is not null/);
  assert.match(importedSource, /IMPORT_VOCAL_REPAIR_SOURCE/);
  assert.match(importedSource, /VOCAL_REPAIR_SOURCE_IMPORT/);
  assert.match(importedSource, /await bindings\.AUDIO\.delete/);
  assert.match(candidates, /rightsAttested/);
  assert.match(candidates, /VOCAL_REPAIR_CANDIDATE/);
  assert.match(candidates, /await bindings\.AUDIO\.delete/);
  assert.match(source, /VOCAL_REPAIR_SOURCE/);
  assert.match(source, /SOURCE_DURATION_MISMATCH/);
  assert.match(selection, /'SELECTED'::vocal_repair_candidate_status/);
  assert.match(render, /\/v1\/phrase-repair-render/);
  assert.match(render, /'VOCAL_REPAIR','ALTERNATIVE'/);
  assert.match(render, /rendered_audio_asset_id/);
  assert.match(studio, /Repair vocal/);
  assert.match(studio, /Fix one line, keep the performance/);
  assert.match(studio, /Use this take/);
  assert.match(studio, /Import aligned original vocal stem/);
  assert.match(studio, /Import vocal for repair/);
  assert.match(studio, /Render repair preview/);
});
test("song workspace returns owner-scoped versions and normalized track assets", async () => {
  const [songsRoute, generationsRoute, generationRoute] = await Promise.all([
    readFile(new URL("../app/api/songs/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generations/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/generations/[id]/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(songsRoute, /where id=\$\{id\} and user_id=\$\{user\.id\}/);
  assert.match(songsRoute, /from version_assets va/);
  assert.match(songsRoute, /a\.owner_id=\$\{user\.id\}/);
  assert.match(songsRoute, /timeline_start_seconds as "timelineStartSeconds"/);
  assert.match(songsRoute, /source_start_seconds as "sourceStartSeconds"/);
  assert.match(songsRoute, /gain_db as "gainDb"/);
  assert.match(songsRoute, /va\.pan/);
  assert.match(songsRoute, /assets:assets\.filter/);
  assert.match(generationsRoute, /s\.id as "songId"/);
  assert.match(generationRoute, /s\.id as "songId"/);
});
test("multitrack workspace synchronizes assets without doubling the master", async () => {
  const studio = await readFile(
    new URL("../app/studio-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(studio, /Multitrack workspace/);
  assert.match(studio, /Open tracks/);
  assert.match(studio, /\["NATIVE_TRACK", "DERIVED_STEM"\]/);
  assert.match(studio, /createMediaElementSource/);
  assert.match(studio, /createStereoPanner/);
  assert.match(studio, /Mute \$\{name\}/);
  assert.match(studio, /Solo \$\{name\}/);
  assert.match(studio, /aria-label=\{`\$\{name\} level`\}/);
  assert.match(studio, /aria-label=\{`\$\{name\} pan`\}/);
  assert.match(studio, /timelineStartSeconds/);
  assert.match(studio, /sourceStartSeconds/);
  assert.match(studio, /Finished master only/);
  assert.match(studio, /source assets unchanged/);
});
test("derived-stem separation is asynchronous, private, and source-linked", async () => {
  const [gateway, route, studio] = await Promise.all([
    readFile(new URL("../ai-service/app/main.py", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/songs/[id]/versions/[versionId]/separation/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/studio-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(gateway, /asyncio\.create_task/);
  assert.match(gateway, /bs-roformer-infer/);
  assert.match(gateway, /SEPARATOR_STEMS=.*vocals.*drums.*bass.*guitar.*piano.*other/);
  assert.match(route, /requireUser/);
  assert.match(route, /a\.owner_id=s\.user_id/);
  assert.match(route, /source_asset_id/);
  assert.match(route, /'SEPARATION'/);
  assert.match(route, /'DERIVED_STEM'/);
  assert.match(route, /'SEPARATED'/);
  assert.match(studio, /Separate into tracks/);
  assert.match(studio, /separation\.message/);
  assert.match(studio, /does not describe these as pristine studio tracks/);
});
test("mixer settings and rendered versions remain owner-scoped and non-destructive", async () => {
  const [route, studio] = await Promise.all([
    readFile(
      new URL(
        "../app/api/songs/[id]/versions/[versionId]/mix/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/studio-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /s\.user_id=\$\{userId\}/);
  assert.match(route, /operation_type[\s\S]*MIX_RENDER/);
  assert.match(route, /parent_version_id/);
  assert.match(route, /next_version_number[\s\S]*for update/);
  assert.match(route, /sourceVersionId: versionId, nonDestructive: true/);
  assert.match(route, /metadata=metadata\|\|/);
  assert.match(studio, /OfflineAudioContext/);
  assert.match(studio, /encodeStereoPcm16Wav/);
  assert.match(studio, /Save mixer settings/);
  assert.match(studio, /Render new mix version/);
  assert.match(studio, /response\.status === 413/);
  assert.match(studio, /leaves the source assets unchanged/);
  assert.match(studio, /Export stem/);
  assert.match(studio, /Download current mix/);
});
test("ACE-Step selection stays behind the provider-neutral gateway", () => {
  const provider = createProvider("acestep", {
    aiServiceBaseUrl: "http://127.0.0.1:8000",
    aceStepModel: "acestep-v15-turbo",
  });
  assert.ok(provider instanceof AceStepMusicProvider);
  assert.equal(provider.name, "acestep");
  assert.equal(provider.model, "acestep-v15-turbo");
  assert.equal(provider.capabilities().nativeMultitrack, false);
  assert.equal(provider.capabilities().masterGeneration, "EXPERIMENTAL");
  assert.equal(provider.capabilities().contextualRegeneration, "EXPERIMENTAL");
  assert.equal(provider.capabilities().sourceSeparation, "UNAVAILABLE");
});

test("MiniMax selection is an experimental local master provider", () => {
  assert.throws(
    () => createProvider("minimax"),
    /GENERATION_PROVIDER_UNAVAILABLE/,
  );
  const provider = createProvider("minimax", {
    aiServiceBaseUrl: "http://127.0.0.1:8000",
    minimaxModel: "MiniMax-Music3-mxfp8",
  });
  assert.ok(provider instanceof MiniMaxMusicProvider);
  assert.equal(provider.name, "minimax");
  assert.equal(provider.model, "MiniMax-Music3-mxfp8");
  assert.equal(provider.capabilities().masterGeneration, "EXPERIMENTAL");
  assert.equal(provider.capabilities().nativeMultitrack, false);
});

test("MiniMax UI exposes the 30-second acceptance duration", async () => {
  const source = await readFile(
    new URL("../app/studio-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\["elevenlabs",\s*"minimax"\]\.includes\(provider\.name\)/,
  );
  assert.match(source, /<option value=\{30\}>30 seconds<\/option>/);
});

test("Eleven Music selection is experimental and requires its dedicated key", () => {
  assert.throws(
    () => createProvider("elevenlabs"),
    /GENERATION_PROVIDER_UNAVAILABLE/,
  );
  const provider = createProvider("elevenlabs", {
    elevenLabsApiKey: "test-key",
  });
  assert.ok(provider instanceof ElevenLabsMusicProvider);
  assert.equal(provider.name, "elevenlabs");
  assert.equal(provider.model, "music_v2");
  assert.equal(provider.capabilities().masterGeneration, "EXPERIMENTAL");
  assert.equal(provider.capabilities().nativeMultitrack, false);
});

test("Eleven Music sends a master-only v2 request and normalizes binary audio", async () => {
  const original = globalThis.fetch,
    input = {
      prompt: "warm reflective soul performance",
      durationSeconds: 12,
      outputMode: "MASTER_ONLY" as const,
      lyrics: "Hold on to the light",
      instrumental: false,
    },
    plan = compose(input);
  let sent: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192",
    );
    sent = init;
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), {
      headers: { "content-type": "audio/mpeg", "song-id": "song-123" },
    });
  };
  try {
    const provider = new ElevenLabsMusicProvider("secret-key"),
      result = await provider.generate({
        jobId: "j",
        userId: "u",
        songId: "s",
        versionId: "v",
        compositionPlan: plan,
        lyrics: input.lyrics,
        seed: 42,
        outputMode: "MASTER_ONLY",
      });
    assert.equal(
      (sent?.headers as Record<string, string>)["xi-api-key"],
      "secret-key",
    );
    const body = JSON.parse(String(sent?.body));
    assert.equal(body.model_id, "music_v2");
    assert.equal(body.music_length_ms, 12000);
    assert.match(body.prompt, /Hold on to the light/);
    assert.equal(result.assets[0].metadata.mimeType, "audio/mpeg");
    assert.deepEqual(
      result.assets[0].audio.bytes,
      new Uint8Array([0x49, 0x44, 0x33]),
    );
    assert.equal(result.assets[0].providerMetadata?.songId, "song-123");
  } finally {
    globalThis.fetch = original;
  }
});
test("Eleven Music normalizes copyrighted prompt rejection without exposing provider details", async () => {
  const original = globalThis.fetch,
    input = {
      prompt: "warm reflective soul performance",
      durationSeconds: 12,
      outputMode: "MASTER_ONLY" as const,
      lyrics: "",
      instrumental: true,
    },
    plan = compose(input);
  globalThis.fetch = async () =>
    Response.json(
      {
        detail: {
          status: "bad_prompt",
          data: { prompt_suggestion: "provider text must stay private" },
        },
      },
      { status: 422 },
    );
  try {
    const provider = new ElevenLabsMusicProvider("secret-key");
    await assert.rejects(
      () =>
        provider.generate({
          jobId: "j",
          userId: "u",
          songId: "s",
          versionId: "v",
          compositionPlan: plan,
          seed: 42,
          outputMode: "MASTER_ONLY",
        }),
      (error) =>
        error instanceof Error && error.message === "PROVIDER_PROMPT_REJECTED",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Eleven Music UI includes attribution, format metadata, and sanitized policy guidance", async () => {
  const [studio, route] = await Promise.all([
    readFile(new URL("../app/studio-app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/generations/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(studio, /Powered by ElevenLabs/);
  assert.match(route, /restricted copyrighted or artist-identifying material/);
  assert.match(route, /provider:r\.provider/);
  assert.match(route, /errorMessage:r\.errorMessage/);
});
test("Eleven Music requires rights confirmation and blocks imitation phrases before generation", () => {
  const allowed = {
    prompt: "original warm soul with restrained drums",
    lyrics: "my original lyric",
    providerPolicyAccepted: true,
  };
  assert.doesNotThrow(() => validateElevenLabsPolicy(allowed));
  assert.throws(
    () =>
      validateElevenLabsPolicy({ ...allowed, providerPolicyAccepted: false }),
    /PROVIDER_POLICY_ACCEPTANCE_REQUIRED/,
  );
  for (const prompt of [
    "sounds like a famous singer",
    "in the style of a band",
    "mimic this artist",
  ]) {
    assert.throws(
      () => validateElevenLabsPolicy({ ...allowed, prompt }),
      /PROVIDER_PROMPT_REJECTED/,
    );
  }
});
test("Eleven Music disclosure is sent with generation requests", async () => {
  const source = await readFile(
    new URL("../app/studio-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /I have rights to this prompt and its lyrics/);
  assert.match(source, /sent to ElevenLabs/);
  assert.match(source, /providerPolicyAccepted/);
});
test("contextual track requests reject invented drum subtargets", () => {
  assert.throws(
    () =>
      contextualTrackGenerationSchema.parse({
        sourceAssetId: crypto.randomUUID(),
        targetInstrumentGroup: "kick",
        seed: 1,
      }),
    /Invalid option/,
  );
  assert.equal(
    contextualTrackGenerationSchema.parse({
      sourceAssetId: crypto.randomUUID(),
      targetInstrumentGroup: "drums",
      seed: 1,
    }).targetInstrumentGroup,
    "drums",
  );
});
test("Lego results normalize to contextual native tracks", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      assets: [
        {
          assetKey: "lego-bass",
          role: "NATIVE_TRACK",
          instrument: "bass",
          instrumentGroup: "bass",
          provenance: "GENERATED_NATIVE",
          isPrimary: false,
          sortOrder: 0,
          audio: { base64: "UklGRg==" },
          metadata: {
            mimeType: "audio/wav",
            codec: "pcm_s16le",
            sampleRate: 48000,
            bitDepth: 16,
            channels: 2,
            durationSeconds: 8,
            waveformData: [],
          },
          providerMetadata: {
            generationMethod: "LEGO_CONTEXTUAL",
            sourceAssetId: "00000000-0000-4000-8000-000000000001",
          },
        },
      ],
    });
  try {
    const provider = new AceStepMusicProvider("http://gateway"),
      result = await provider.generateContextualTrack!({
        jobId: "j",
        userId: "u",
        songId: "s",
        versionId: "v",
        sourceAssetId: "00000000-0000-4000-8000-000000000001",
        targetInstrumentGroup: "bass",
        seed: 1,
        caption: "warm",
        sourceAudio: new Uint8Array([1]),
        sourceMimeType: "audio/wav",
      });
    assert.equal(result.assets[0].role, "NATIVE_TRACK");
    assert.equal(result.assets[0].provenance, "GENERATED_NATIVE");
    assert.equal(
      result.assets[0].providerMetadata?.generationMethod,
      "LEGO_CONTEXTUAL",
    );
    assert.ok(result.assets[0].audio.bytes);
  } finally {
    globalThis.fetch = original;
  }
});
