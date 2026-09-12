import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { getSql } from "../db";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function sha256(path: string) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

const profileSelector = option("--profile"),
  versionNumber = Number(option("--version"));
if (!profileSelector || !Number.isInteger(versionNumber) || versionNumber < 1)
  throw new Error(
    "Usage: npm run vocal:prepare-training -- --profile <name-or-id> --version <number>",
  );

const projectRoot = resolve(import.meta.dirname, ".."),
  variables = Object.fromEntries(
    (await readFile(join(projectRoot, ".dev.vars"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
if (!variables.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

const sql = getSql(variables.DATABASE_URL);
try {
  const profiles = await sql<
      {
        id: string;
        name: string;
        status: string;
        verifiedAt: string | null;
        usableSeconds: number;
        qualityScore: number | null;
      }[]
    >`
      select id,name,status,verified_at as "verifiedAt",
        usable_singing_seconds::float8 as "usableSeconds",
        quality_score::float8 as "qualityScore"
      from artist_vocal_profiles
      where id::text=${profileSelector} or lower(name)=lower(${profileSelector})
    `;
  if (profiles.length !== 1)
    throw new Error(
      profiles.length
        ? "The profile name is ambiguous; use its ID instead."
        : "Vocal profile not found.",
    );
  const profile = profiles[0];
  if (!profile.verifiedAt)
    throw new Error("The vocal profile must pass identity verification first.");
  if (profile.status !== "READY")
    throw new Error(`The vocal profile is ${profile.status}, not READY.`);
  if (Number(profile.usableSeconds) < 600)
    throw new Error("At least 600 usable singing seconds are required.");

  const sources = await sql<
    {
      id: string;
      audioAssetId: string;
      sourceType: string;
      originalFilename: string | null;
      storageKey: string;
      mimeType: string;
      fileSize: number;
      checksum: string;
      durationSeconds: number;
      usableSeconds: number;
      qualityScore: number;
    }[]
  >`
    select s.id,s.audio_asset_id as "audioAssetId",s.source_type as "sourceType",
      s.original_filename as "originalFilename",a.storage_key as "storageKey",
      a.mime_type as "mimeType",a.file_size as "fileSize",a.checksum,
      s.duration_seconds::float8 as "durationSeconds",
      s.usable_duration_seconds::float8 as "usableSeconds",
      s.quality_score::float8 as "qualityScore"
    from vocal_profile_sources s
    join audio_assets a on a.id=s.audio_asset_id
    where s.profile_id=${profile.id}
      and s.included_in_training=true
      and s.source_type='OWNED_VOCAL_BOUNCE'
      and s.rights_attested=true
    order by s.created_at,s.id
  `;
  if (!sources.length) throw new Error("No approved singing sources were found.");

  const metadataDirectory = join(
      projectRoot,
      ".wrangler/state/v3/r2/miniflare-R2BucketObject",
    ),
    metadataFiles = (await readdir(metadataDirectory)).filter((file) =>
      /^[a-f0-9]{64}\.sqlite$/.test(file),
    );
  if (metadataFiles.length !== 1)
    throw new Error("Could not identify the local private-audio index.");
  const metadataPath = join(metadataDirectory, metadataFiles[0]),
    objectRows = JSON.parse(
      execFileSync(
        "sqlite3",
        [metadataPath, "-json", "select key,blob_id as blobId,size from _mf_objects"],
        { encoding: "utf8" },
      ) || "[]",
    ) as { key: string; blobId: string; size: number }[],
    objectByKey = new Map(objectRows.map((row) => [row.key, row])),
    artifactRoot = join(projectRoot, "artifacts/vocal-training"),
    target = join(artifactRoot, `${slug(profile.name)}-v${versionNumber}`);
  try {
    await stat(target);
    throw new Error(`Training snapshot already exists: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(artifactRoot, { recursive: true });
  const temporary = await mkdtemp(join(artifactRoot, ".preparing-")),
    audioDirectory = join(temporary, "source-audio");
  await mkdir(audioDirectory);
  try {
    const entries = [];
    for (const [index, source] of sources.entries()) {
      const object = objectByKey.get(source.storageKey);
      if (!object) throw new Error(`Private audio is missing: ${source.id}`);
      if (Number(object.size) !== Number(source.fileSize))
        throw new Error(`Private audio size mismatch: ${source.id}`);
      const extension = extname(source.storageKey) || ".audio",
        file = `${String(index + 1).padStart(3, "0")}-${source.id}${extension}`,
        blobPath = join(
          projectRoot,
          ".wrangler/state/v3/r2/site-creator-r2/blobs",
          basename(object.blobId),
        ),
        outputPath = join(audioDirectory, file);
      await copyFile(blobPath, outputPath);
      const copiedChecksum = await sha256(outputPath);
      if (copiedChecksum !== source.checksum)
        throw new Error(`Private audio checksum mismatch: ${source.id}`);
      entries.push({
        sourceId: source.id,
        audioAssetId: source.audioAssetId,
        sourceType: source.sourceType,
        originalFilename: source.originalFilename,
        file: `source-audio/${file}`,
        mimeType: source.mimeType,
        fileSize: source.fileSize,
        checksum: source.checksum,
        durationSeconds: source.durationSeconds,
        usableSeconds: source.usableSeconds,
        qualityScore: source.qualityScore,
      });
    }
    const canonicalSources = entries.map(
        ({ sourceId, audioAssetId, sourceType, checksum, usableSeconds }) => ({
          sourceId,
          audioAssetId,
          sourceType,
          checksum,
          usableSeconds,
        }),
      ),
      sourceManifestChecksum = createHash("sha256")
        .update(JSON.stringify(canonicalSources))
        .digest("hex"),
      manifest = {
        schemaVersion: 1,
        profile: {
          id: profile.id,
          name: profile.name,
          verifiedAt: profile.verifiedAt,
          qualityScore: profile.qualityScore,
        },
        versionNumber,
        provider: "RVC",
        providerModel: "RVC-v2-40k-f0",
        sourceManifestChecksum,
        selectedSourceCount: entries.length,
        selectedUsableSeconds: Number(
          entries.reduce((total, entry) => total + entry.usableSeconds, 0).toFixed(3),
        ),
        selectionPolicy:
          "Use approved lossless owned-vocal imports for training. Reserve compressed live takes for evaluation.",
        excludedSourceRule:
          "Exclude live recordings, failed analysis, missing rights attestation, and deleted imports.",
        sources: entries,
      };
    await writeFile(
      join(temporary, "training-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await rename(temporary, target);
    console.log(
      `Prepared ${entries.length} approved clips (${manifest.selectedUsableSeconds}s usable).`,
    );
    console.log(`Manifest checksum: ${sourceManifestChecksum}`);
    console.log(`Snapshot: ${target}`);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
} finally {
  await sql.end();
}
