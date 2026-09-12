import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getSql } from "../db";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function sha256(path: string) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

const profileSelector = option("--profile"),
  versionNumber = Number(option("--version")),
  manifestPath = resolve(option("--manifest") || ""),
  modelPath = resolve(option("--model") || ""),
  indexPath = resolve(option("--index") || "");

if (
  !profileSelector ||
  !Number.isInteger(versionNumber) ||
  versionNumber < 1 ||
  !option("--manifest") ||
  !option("--model") ||
  !option("--index")
)
  throw new Error(
    "Usage: npm run vocal:activate-version -- --profile <name-or-id> --version <number> --manifest <path> --model <path> --index <path>",
  );

await Promise.all([stat(manifestPath), stat(modelPath), stat(indexPath)]);

const projectRoot = resolve(import.meta.dirname, ".."),
  variables = Object.fromEntries(
    (await readFile(resolve(projectRoot, ".dev.vars"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  ),
  manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    schemaVersion: number;
    profile: { id: string; name: string; verifiedAt: string | null };
    versionNumber: number;
    provider: string;
    providerModel: string;
    sourceManifestChecksum: string;
    selectedSourceCount: number;
    selectedUsableSeconds: number;
  };

if (!variables.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
if (manifest.schemaVersion !== 1)
  throw new Error(`Unsupported training manifest schema: ${manifest.schemaVersion}`);
if (manifest.versionNumber !== versionNumber)
  throw new Error("The requested version does not match the training manifest.");
if (!manifest.profile.verifiedAt)
  throw new Error("The training manifest is not tied to a verified identity.");
if (!/^[a-f0-9]{64}$/.test(manifest.sourceManifestChecksum))
  throw new Error("The training manifest checksum is invalid.");

const [modelChecksum, indexChecksum] = await Promise.all([
    sha256(modelPath),
    sha256(indexPath),
  ]),
  trainingConfig = {
    manifestSchemaVersion: manifest.schemaVersion,
    selectedSourceCount: manifest.selectedSourceCount,
    selectedUsableSeconds: manifest.selectedUsableSeconds,
    epochs: 25,
    sampleRate: 40000,
    pitchGuidance: true,
    pitchExtractor: "RMVPE",
    batchSize: 4,
    precision: "float32",
    trainingDevice: "CPU",
    retrievalIndexRef: indexPath,
    retrievalIndexChecksum: indexChecksum,
    modelChecksum,
  },
  validationMetrics = {
    artistApproved: true,
    artistGrade: "A",
    identityRetention: "PASS",
    intelligibility: "PASS",
    stableMidRegister: "PASS",
    wideTransition: "PASS_WITH_KNOWN_PHRASE_ARTIFACT",
    highRegister: "PASS_WITH_KNOWN_PHRASE_ARTIFACT",
    knownLimitations: [
      "Occasional vocoder texture on the phrase 'my mix'.",
      "Occasional vocoder texture on the phrase 'Yes I'.",
    ],
    mitigation: "Use phrase repair or an artist punch-in for isolated conversion artifacts.",
  },
  sql = getSql(variables.DATABASE_URL);

try {
  const activated = await sql.begin(async (tx) => {
    const profiles = await tx<
      { id: string; name: string; verifiedAt: string | null; status: string }[]
    >`
      select id,name,verified_at as "verifiedAt",status
      from artist_vocal_profiles
      where id::text=${profileSelector} or lower(name)=lower(${profileSelector})
      for update
    `;
    if (profiles.length !== 1)
      throw new Error(
        profiles.length
          ? "The profile name is ambiguous; use its ID instead."
          : "Vocal profile not found.",
      );
    const profile = profiles[0];
    if (profile.id !== manifest.profile.id)
      throw new Error("The selected profile does not match the training manifest.");
    if (!profile.verifiedAt)
      throw new Error("The vocal profile must pass identity verification first.");
    if (profile.status === "REVOKED")
      throw new Error("A revoked vocal profile cannot be activated.");

    const existing = await tx<
      {
        id: string;
        provider: string;
        providerModel: string;
        providerModelRef: string | null;
        sourceManifestChecksum: string;
      }[]
    >`
      select id,provider,provider_model as "providerModel",
        provider_model_ref as "providerModelRef",
        source_manifest_checksum as "sourceManifestChecksum"
      from vocal_profile_versions
      where profile_id=${profile.id} and version_number=${versionNumber}
      limit 1
    `;
    let versionId = existing[0]?.id;
    if (existing[0]) {
      const recorded = existing[0];
      if (
        recorded.provider !== manifest.provider ||
        recorded.providerModel !== manifest.providerModel ||
        recorded.providerModelRef !== modelPath ||
        recorded.sourceManifestChecksum !== manifest.sourceManifestChecksum
      )
        throw new Error(
          "Version 1 is already registered with different immutable provenance.",
        );
    } else {
      const inserted = await tx<{ id: string }[]>`
        insert into vocal_profile_versions(
          profile_id,version_number,status,is_active,provider,provider_model,
          provider_model_ref,source_manifest_checksum,training_config,
          validation_metrics
        ) values(
          ${profile.id},${versionNumber},'READY',false,${manifest.provider},
          ${manifest.providerModel},${modelPath},${manifest.sourceManifestChecksum},
          ${tx.json(trainingConfig)},${tx.json(validationMetrics)}
        ) returning id
      `;
      versionId = inserted[0].id;
    }

    await tx`
      update vocal_profile_versions set is_active=false
      where profile_id=${profile.id} and id<>${versionId}
    `;
    await tx`
      update vocal_profile_versions set status='READY',is_active=true,
        activated_at=coalesce(activated_at,now())
      where id=${versionId} and profile_id=${profile.id}
    `;
    await tx`
      insert into vocal_profile_training_jobs(
        profile_id,profile_version_id,status,provider,provider_model,
        attempt_count,max_attempts,progress,started_at,completed_at
      ) values(
        ${profile.id},${versionId},'COMPLETE',${manifest.provider},
        ${manifest.providerModel},1,3,100,now(),now()
      )
      on conflict(profile_version_id) do update set
        status='COMPLETE',progress=100,error_code=null,error_message=null,
        error_retryable=null,completed_at=coalesce(vocal_profile_training_jobs.completed_at,now()),
        updated_at=now()
    `;
    await tx`
      update artist_vocal_profiles set status='ACTIVE',
        metadata=metadata || ${tx.json({
          activeVocalProfileVersionId: versionId,
          activeVocalProfileVersion: versionNumber,
        })},updated_at=now()
      where id=${profile.id}
    `;
    return { profile, versionId };
  });
  console.log(
    `${activated.profile.name} Version ${versionNumber} is active (${activated.versionId}).`,
  );
  console.log(`Model SHA-256: ${modelChecksum}`);
  console.log(`Index SHA-256: ${indexChecksum}`);
} finally {
  await sql.end();
}
