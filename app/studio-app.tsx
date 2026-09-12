/* eslint-disable jsx-a11y/media-has-caption, jsx-a11y/label-has-associated-control -- generated audio has no dialogue; policy checkbox is nested in its visible label */
"use client";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Status =
  | "QUEUED"
  | "PREPARING"
  | "GENERATING"
  | "POST_PROCESSING"
  | "UPLOADING"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLED";
type Song = {
  id: string;
  songId?: string;
  title: string;
  prompt: string;
  createdAt: string;
  version: number;
  duration: number;
  bpm: number;
  musicalKey: string;
  genre: string;
  provider?: string;
  vocalist?: string;
  status: Status;
  progress: number;
  waveform: number[];
  seed: number;
  audioUrl?: string;
  errorMessage?: string;
};
type TrackAsset = {
  id: string;
  audioAssetId: string;
  role: string;
  instrument: string | null;
  instrumentGroup: string | null;
  sourceType: string;
  sortOrder: number;
  isPrimary: boolean;
  timelineStartSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number | null;
  gainDb: number;
  pan: number;
  durationSeconds: number;
  waveform: number[];
  mimeType: string;
  codec: string;
  metadata: Record<string, unknown>;
  audioUrl: string;
};
type StudioVersion = {
  id: string;
  version: number;
  duration: number;
  bpm: number;
  musicalKey: string;
  scale: string;
  prompt: string;
  provider: string;
  providerModel: string;
  seed: number;
  createdAt: string;
  audioAssetId: string | null;
  waveform: number[];
  audioUrl?: string;
  assets: TrackAsset[];
};
type SongWorkspace = {
  song: {
    id: string;
    title: string;
    description: string;
    lyrics: string;
    isInstrumental: boolean;
    createdAt: string;
  };
  versions: StudioVersion[];
};
type User = { id: string; email: string; displayName: string };
type ProviderStatus = {
  name: string;
  model: string;
  available: boolean;
  masterGeneration: string;
};
type VocalProfile = {
  id: string;
  name: string;
  status:
    | "DRAFT"
    | "COLLECTING"
    | "READY"
    | "TRAINING"
    | "ACTIVE"
    | "FAILED"
    | "REVOKED";
  isPrivate: boolean;
  usableSingingSeconds: number;
  qualityScore: number | null;
  rangeLowMidi: number | null;
  rangeHighMidi: number | null;
  sourceCount: number;
  consentedAt: string | null;
  verifiedAt: string | null;
  latestPhraseMatchScore: number | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  activeProviderModel: string | null;
  createdAt: string;
  sources: Array<{
    id: string;
    sourceType:
      | "LIVE_SPEECH"
      | "LIVE_SINGING"
      | "OWNED_VOCAL_BOUNCE"
      | "SEPARATED_OWNED_MIX";
    originalFilename: string | null;
    durationSeconds: number;
    usableDurationSeconds: number;
    qualityScore: number | null;
    includedInTraining: boolean;
    analysisStatus: string;
    audioUrl: string;
    createdAt: string;
  }>;
};
function importedPerformanceName(filename: string | null) {
  return (filename || "Imported vocal").replace(
    /\.part-\d+-of-\d+\.wav$/i,
    "",
  );
}
function visibleVoiceSources(sources: VocalProfile["sources"]) {
  const seenImports = new Set<string>();
  return sources.filter((source) => {
    if (source.sourceType !== "OWNED_VOCAL_BOUNCE") return true;
    const name = importedPerformanceName(source.originalFilename);
    if (seenImports.has(name)) return false;
    seenImports.add(name);
    return true;
  });
}
function voiceSourceSummary(
  source: VocalProfile["sources"][number],
  sources: VocalProfile["sources"],
) {
  if (source.sourceType !== "OWNED_VOCAL_BOUNCE")
    return {
      durationSeconds: source.durationSeconds,
      usableSeconds: source.usableDurationSeconds,
      analysisStatus: source.analysisStatus,
      qualityScore: source.qualityScore,
      partCount: 1,
    };
  const name = importedPerformanceName(source.originalFilename),
    parts = sources.filter(
      (item) =>
        item.sourceType === "OWNED_VOCAL_BOUNCE" &&
        importedPerformanceName(item.originalFilename) === name,
    ),
    scores = parts
      .map((item) => item.qualityScore)
      .filter((score): score is number => score !== null);
  return {
    durationSeconds: parts.reduce(
      (total, item) => total + item.durationSeconds,
      0,
    ),
    usableSeconds: parts.reduce(
      (total, item) => total + item.usableDurationSeconds,
      0,
    ),
    analysisStatus: parts.some((item) => item.analysisStatus === "PENDING")
      ? "PENDING"
      : parts.every((item) => item.analysisStatus === "PASSED")
        ? "PASSED"
        : "REJECTED",
    qualityScore: scores.length
      ? scores.reduce((total, score) => total + score, 0) / scores.length
      : null,
    partCount: parts.length,
  };
}
type VocalChallenge = {
  verificationId: string;
  profileId: string;
  phrase: string;
  challengeToken: string;
  expiresAt: string;
  minimumSeconds: number;
  maximumSeconds: number;
};
type VocalPreview = {
  blob: Blob;
  url: string;
  kind: "identity" | "singing";
  profileId: string;
  duration: number;
  channelCount: number;
};
type VocalRepairCandidate = {
  id: string;
  repairSessionId: string;
  audioAssetId: string | null;
  method: "OWNED_PUNCH_IN" | "RVC" | "SOULX_SVC";
  label: string;
  status: "PENDING" | "READY" | "SELECTED" | "REJECTED" | "FAILED";
  audioUrl?: string;
  createdAt?: string;
};
type VocalRepair = {
  id: string;
  songId: string;
  sourceVersionId: string;
  sourceVocalAssetId: string | null;
  renderedAudioAssetId: string | null;
  sourceVocalAudioUrl?: string;
  renderedAudioUrl?: string;
  vocalProfileId: string | null;
  lyricText: string;
  startSeconds: number;
  endSeconds: number;
  crossfadeMs: number;
  status:
    | "AWAITING_TAKE"
    | "READY"
    | "SELECTED"
    | "RENDERING"
    | "APPLIED"
    | "FAILED"
    | "CANCELLED";
  candidates: VocalRepairCandidate[];
  createdAt: string;
};
function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer),
    write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1)
        view.setUint8(offset + index, value.charCodeAt(index));
    };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
function encodeStereoPcm16Wav(buffer: AudioBuffer) {
  const channels = 2,
    frameCount = buffer.length,
    bytes = new ArrayBuffer(44 + frameCount * channels * 2),
    view = new DataView(bytes),
    left = buffer.getChannelData(0),
    right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left,
    write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1)
        view.setUint8(offset + index, value.charCodeAt(index));
    };
  write(0, "RIFF");
  view.setUint32(4, 36 + frameCount * channels * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frameCount * channels * 2, true);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameSamples = [left[frame], right[frame]];
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = frameSamples[channel];
      const bounded = Math.max(-1, Math.min(1, sample)),
        offset = 44 + (frame * channels + channel) * 2;
      view.setInt16(offset, bounded < 0 ? bounded * 0x8000 : bounded * 0x7fff, true);
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}
const paths: Record<string, string> = {
  create: "M12 3v18M3 12h18",
  library: "M4 5v14M9 5v14M14 7v12M19 4v15",
  voice:
    "M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Zm-7 10a7 7 0 0 0 14 0M12 19v3M8 22h8",
  play: "m9 7 8 5-8 5V7Z",
  pause: "M9 7v10M15 7v10",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.9 8.6 8.8-8.6a5.5 5.5 0 0 0 1.1-8.9Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  spark: "m12 3-1.4 4.2L7 9l3.6 1.8L12 15l1.4-4.2L17 9l-3.6-1.8L12 3Z",
  search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  skip: "m6 6 8 6-8 6V6Zm10 0v12",
  volume: "M11 5 6 9H2v6h4l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7",
  chevron: "m9 18 6-6-6-6",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
};
const labels: Record<Status, string> = {
  QUEUED: "Queued",
  PREPARING: "Preparing composition",
  GENERATING: "Generating audio",
  POST_PROCESSING: "Finishing vocals and mix",
  UPLOADING: "Saving master",
  COMPLETE: "Ready",
  FAILED: "Generation failed",
  CANCELLED: "Cancelled",
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
function Wave({
  data,
  progress = 0,
  compact = false,
  onSeek,
  ariaLabel = "Seek in song",
}: {
  data: number[];
  progress?: number;
  compact?: boolean;
  onSeek?: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      className={`waveform ${compact ? "compact" : ""}`}
      aria-label={ariaLabel}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek?.((e.clientX - r.left) / r.width);
      }}
    >
      {data.map((p, i) => (
        <i
          key={i}
          className={i / data.length <= progress ? "played" : ""}
          style={{ height: `${Math.max(10, p * 100).toFixed(2)}%` }}
        />
      ))}
    </button>
  );
}

function AuthGate({ onAuthenticated }: { onAuthenticated: (u: User) => void }) {
  const [register, setRegister] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget),
      body = {
        displayName: String(form.get("displayName") || ""),
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
      };
    try {
      const res = await fetch(`/api/auth/${register ? "register" : "login"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = (await res.json()) as {
          user?: User;
          error?: { message: string };
        };
      if (!res.ok || !data.user)
        throw new Error(data.error?.message || "Could not sign in.");
      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <section>
        <div className="auth-brand">
          <span>dz</span>
          <p>DOZI MUSIC STUDIO</p>
        </div>
        <h1>{register ? "Create your studio" : "Welcome back"}</h1>
        <p>
          Your songs, versions, and masters stay attached to your private Dozi
          account—never a ChatGPT login.
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Display name
              <input
                name="displayName"
                autoComplete="name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={10}
            />
          </label>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <button className="generate" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setRegister((v) => !v);
            setError("");
          }}
        >
          {register
            ? "Already have an account? Sign in"
            : "New to Dozi? Create an account"}
        </button>
      </section>
    </div>
  );
}

export default function StudioApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined),
    [provider, setProvider] = useState<ProviderStatus>({
      name: "provider",
      model: "",
      available: false,
      masterGeneration: "UNAVAILABLE",
    }),
    [view, setView] = useState<"create" | "library" | "tracks" | "voice">(
      "create",
    ),
    [mode, setMode] = useState<"Simple" | "Advanced">("Simple"),
    [prompt, setPrompt] = useState(
      "Warm neo-soul song about finding purpose later in life",
    ),
    [instrumental, setInstrumental] = useState(false),
    [lyrics, setLyrics] = useState(""),
    [songBpm, setSongBpm] = useState(76),
    [songKey, setSongKey] = useState("F#"),
    [songScale, setSongScale] = useState<"major" | "minor">("minor"),
    [durationSeconds, setDurationSeconds] = useState(12),
    [providerPolicyAccepted, setProviderPolicyAccepted] = useState(false),
    [songs, setSongs] = useState<Song[]>([]),
    [profiles, setProfiles] = useState<VocalProfile[]>([]),
    [selectedVocalProfileId, setSelectedVocalProfileId] = useState(""),
    [profileName, setProfileName] = useState("My Voice"),
    [profileBusy, setProfileBusy] = useState(false),
    [profileNotice, setProfileNotice] = useState(""),
    [profileError, setProfileError] = useState(""),
    [analysisProgress, setAnalysisProgress] = useState<{
      profileId: string;
      processed: number;
      total: number;
      running: boolean;
    } | null>(null),
    [importProgress, setImportProgress] = useState<{
      profileId: string;
      fileName: string;
      stage: "READING" | "UPLOADING" | "SAVED" | "FAILED";
      message: string;
    } | null>(null),
    [voiceConsent, setVoiceConsent] = useState(false),
    [challenge, setChallenge] = useState<VocalChallenge | null>(null),
    [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]),
    [selectedInputId, setSelectedInputId] = useState(""),
    [selectedInputChannel, setSelectedInputChannel] = useState(1),
    [meterLevel, setMeterLevel] = useState(0),
    [monitoring, setMonitoring] = useState(false),
    [preview, setPreview] = useState<VocalPreview | null>(null),
    [recording, setRecording] = useState(false),
    [recordingKind, setRecordingKind] = useState<"identity" | "singing" | null>(
      null,
    ),
    [recordingSeconds, setRecordingSeconds] = useState(0),
    [active, setActive] = useState<Song | null>(null),
    [songWorkspace, setSongWorkspace] = useState<SongWorkspace | null>(null),
    [workspaceBusy, setWorkspaceBusy] = useState(false),
    [workspaceError, setWorkspaceError] = useState(""),
    [libraryNotice, setLibraryNotice] = useState(""),
    [archiveCandidate, setArchiveCandidate] = useState<Song | null>(null),
    [archiveBusy, setArchiveBusy] = useState(false),
    [repairSong, setRepairSong] = useState<Song | null>(null),
    [repairImportOpen, setRepairImportOpen] = useState(false),
    [songImportOpen, setSongImportOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [search, setSearch] = useState(""),
    [librarySort, setLibrarySort] = useState<"newest" | "oldest">("newest"),
    [librarySource, setLibrarySource] = useState<
      "all" | "generated" | "imported" | "my-voice"
    >("all"),
    [libraryView, setLibraryView] = useState<"grid" | "list">("grid"),
    [libraryVisibleCount, setLibraryVisibleCount] = useState(24),
    [blueprint, setBlueprint] = useState(true),
    [submitting, setSubmitting] = useState(false),
    [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null),
    pendingSongStart = useRef<number | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    recordingChunks = useRef<Blob[]>([]),
    recordingElapsed = useRef(0),
    recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    recordingTargetProfile = useRef<string | null>(null),
    monitorStream = useRef<MediaStream | null>(null),
    monitorSourceStream = useRef<MediaStream | null>(null),
    monitorContext = useRef<AudioContext | null>(null),
    monitorFrame = useRef<number | null>(null),
    plan = useMemo(
      () => ({
        genre: prompt.toLowerCase().includes("soul")
          ? "Neo-soul"
          : "Alternative pop",
        bpm: songBpm,
        key: `${songKey} ${songScale}`,
        mood: prompt.toLowerCase().includes("warm")
          ? "Warm · Reflective"
          : "Intimate · Hopeful",
      }),
      [prompt, songBpm, songKey, songScale],
    ),
    activeVocalProfiles = useMemo(
      () =>
        profiles.filter(
          (profile) => profile.status === "ACTIVE" && profile.activeVersionId,
        ),
      [profiles],
    ),
    activeGenerationJobs = useMemo(
      () =>
        songs.filter(
          (song) => !["COMPLETE", "FAILED", "CANCELLED"].includes(song.status),
        ),
      [songs],
    );
  const loadSongs = useCallback(async () => {
    const res = await fetch("/api/generations", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { songs: Song[] };
      setSongs(data.songs);
    }
  }, []);
  const loadProfiles = useCallback(async () => {
    const res = await fetch("/api/vocal-profiles", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { profiles: VocalProfile[] };
      setProfiles(data.profiles);
    }
  }, []);
  const stopMonitoring = useCallback(() => {
    if (monitorFrame.current !== null)
      cancelAnimationFrame(monitorFrame.current);
    monitorFrame.current = null;
    monitorStream.current?.getTracks().forEach((track) => track.stop());
    monitorStream.current = null;
    monitorSourceStream.current?.getTracks().forEach((track) => track.stop());
    monitorSourceStream.current = null;
    if (monitorContext.current) void monitorContext.current.close();
    monitorContext.current = null;
    setMonitoring(false);
    setMeterLevel(0);
  }, []);
  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (r) => (await r.json()) as { user: User | null })
      .then(async (d) => {
        setUser(d.user);
        if (d.user) await Promise.all([loadSongs(), loadProfiles()]);
      })
      .catch(() => setUser(null));
  }, [loadProfiles, loadSongs]);
  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then(
        async (r) =>
          (await r.json()) as {
            providers: Array<{
              name: string;
              model: string;
              health: { available: boolean };
              capabilities: { masterGeneration: string };
            }>;
          },
      )
      .then((d) => {
        const p = d.providers[0];
        if (p)
          setProvider({
            name: p.name,
            model: p.model,
            available: p.health.available,
            masterGeneration: p.capabilities.masterGeneration,
          });
      })
      .catch(() =>
        setProvider({
          name: "provider",
          model: "",
          available: false,
          masterGeneration: "UNAVAILABLE",
        }),
      );
  }, []);
  useEffect(() => {
    const pending = songs.filter(
      (s) => !["COMPLETE", "FAILED", "CANCELLED"].includes(s.status),
    );
    if (!pending.length) return;
    const timer = setInterval(async () => {
      const updates = await Promise.all(
        pending.map(
          async (s) =>
            (
              (await fetch(`/api/generations/${s.id}`, {
                cache: "no-store",
              }).then((r) => r.json())) as { song: Song }
            ).song,
        ),
      );
      setSongs((current) =>
        current.map((s) => updates.find((u) => u.id === s.id) || s),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [songs]);
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      if (pendingSongStart.current !== null) return;
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, active]);
  useEffect(() => () => stopMonitoring(), [stopMonitoring]);
  const fmt = (n: number) =>
    `${Math.floor(n / 60)}:${Math.floor(n % 60)
      .toString()
      .padStart(2, "0")}`;
  function play(song: Song) {
    if (!song.audioUrl) return;
    pendingSongStart.current = null;
    const element = audio.current;
    if (active?.id === song.id) {
      if (playing) {
        element?.pause();
        setPlaying(false);
      } else {
        setPlaying(true);
        // Start within the button click itself so browsers treat this as a
        // user-initiated playback request instead of an autoplay attempt.
        void element?.play().catch(() => setPlaying(false));
      }
      return;
    }

    setActive(song);
    setTime(0);
    setPlaying(true);
    if (element) {
      // React will also update this source after state commits, but setting it
      // here lets playback begin from the card's Play button gesture.
      element.src = song.audioUrl;
      element.currentTime = 0;
      void element.play().catch(() => setPlaying(false));
    }
  }
  function playFromSongWaveform(song: Song, fraction: number) {
    if (!song.audioUrl) return;
    const start = Math.max(0, Math.min(song.duration, fraction * song.duration));
    if (active?.id === song.id) {
      pendingSongStart.current = null;
      if (audio.current) audio.current.currentTime = start;
      setTime(start);
      setPlaying(true);
      void audio.current?.play().catch(() => setPlaying(false));
      return;
    }
    pendingSongStart.current = start;
    setActive(song);
    setTime(start);
    setPlaying(true);
    if (audio.current) {
      audio.current.src = song.audioUrl;
      audio.current.currentTime = start;
      void audio.current.play().catch(() => setPlaying(false));
    }
  }
  useEffect(() => {
    const returnToSongStart = (event: KeyboardEvent) => {
      if (
        view === "tracks" ||
        event.code !== "Enter" ||
        event.repeat ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !active ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      pendingSongStart.current = null;
      if (audio.current) audio.current.currentTime = 0;
      setTime(0);
    };
    window.addEventListener("keydown", returnToSongStart, true);
    return () => window.removeEventListener("keydown", returnToSongStart, true);
  }, [active, view]);
  async function openWorkspace(song: Song) {
    setPlaying(false);
    setWorkspaceError("");
    setSongWorkspace(null);
    setView("tracks");
    if (!song.songId) {
      setWorkspaceError(
        "This older library entry is missing its song link. Refresh the library and try again.",
      );
      return;
    }
    setWorkspaceBusy(true);
    try {
      const res = await fetch(`/api/songs/${song.songId}`, {
          cache: "no-store",
        }),
        data = (await res.json()) as SongWorkspace & {
          error?: { message: string };
        };
      if (!res.ok || !data.song)
        throw new Error(data.error?.message || "Could not open this song.");
      setSongWorkspace(data);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : "Could not open this song.",
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }
  async function archiveLibrarySong() {
    if (!archiveCandidate?.songId || archiveBusy) return;
    setArchiveBusy(true);
    setLibraryNotice("");
    try {
      const response = await fetch(`/api/songs/${archiveCandidate.songId}`, {
          method: "DELETE",
        }),
        payload = (await response.json()) as {
          archived?: boolean;
          error?: { message?: string };
        };
      if (!response.ok || !payload.archived)
        throw new Error(payload.error?.message || "The song could not be archived.");
      const songId = archiveCandidate.songId;
      setSongs((items) => items.filter((song) => song.songId !== songId));
      if (active?.songId === songId) {
        setPlaying(false);
        setActive(null);
        setTime(0);
      }
      setLibraryNotice(`${archiveCandidate.title} was archived. Its private audio remains preserved.`);
      setArchiveCandidate(null);
    } catch (error) {
      setLibraryNotice(
        error instanceof Error ? error.message : "The song could not be archived.",
      );
    } finally {
      setArchiveBusy(false);
    }
  }
  async function generate() {
    if (
      !prompt.trim() ||
      submitting ||
      (provider.name === "elevenlabs" && !providerPolicyAccepted)
    )
      return;
    setSubmitting(true);
    setNotice("");
    try {
      const res = await fetch("/api/generations", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            prompt,
            lyrics,
            instrumental,
            genre: plan.genre,
            bpm: songBpm,
            key: songKey,
            scale: songScale,
            durationSeconds,
            providerPolicyAccepted,
            vocalProfileId: instrumental ? null : selectedVocalProfileId || null,
          }),
        }),
        data = (await res.json()) as {
          song?: Song;
          error?: { message: string };
        };
      if (!res.ok || !data.song)
        throw new Error(data.error?.message || "Generation could not start.");
      setSongs((x) => [data.song as Song, ...x]);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Generation could not start.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSongs([]);
    setActive(null);
    setPlaying(false);
  }
  async function createProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileNotice("");
    try {
      const res = await fetch("/api/vocal-profiles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: profileName }),
        }),
        data = (await res.json()) as {
          profile?: VocalProfile;
          error?: { message: string };
        };
      if (!res.ok || !data.profile)
        throw new Error(data.error?.message || "Could not create the profile.");
      setProfiles((p) => [data.profile as VocalProfile, ...p]);
      setProfileName("");
      setProfileNotice(
        "Private profile created. Recording enrollment is the next step.",
      );
    } catch (err) {
      setProfileNotice(
        err instanceof Error ? err.message : "Could not create the profile.",
      );
    } finally {
      setProfileBusy(false);
    }
  }
  async function setupMicrophone(
    deviceId = selectedInputId,
    inputChannel = selectedInputChannel,
  ) {
    stopMonitoring();
    setProfileNotice("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId
            ? {
                deviceId: { exact: deviceId },
                channelCount: { ideal: 2 },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : {
                channelCount: { ideal: 2 },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
        }),
        devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "audioinput",
        ),
        activeDevice = stream.getAudioTracks()[0]?.getSettings().deviceId || "",
        context = new AudioContext(),
        source = context.createMediaStreamSource(stream),
        splitter = context.createChannelSplitter(2),
        merger = context.createChannelMerger(2),
        destination = context.createMediaStreamDestination(),
        analyser = context.createAnalyser(),
        samples = new Uint8Array(analyser.fftSize);
      source.connect(splitter);
      splitter.connect(merger, inputChannel - 1, 0);
      splitter.connect(merger, inputChannel - 1, 1);
      splitter.connect(analyser, inputChannel - 1);
      merger.connect(destination);
      monitorSourceStream.current = stream;
      monitorStream.current = destination.stream;
      monitorContext.current = context;
      setAudioInputs(devices);
      setSelectedInputId(
        activeDevice || deviceId || devices[0]?.deviceId || "",
      );
      setMonitoring(true);
      const updateMeter = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          energy += normalized * normalized;
        }
        setMeterLevel(Math.min(100, Math.sqrt(energy / samples.length) * 240));
        monitorFrame.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch {
      setProfileNotice(
        "Microphone setup failed. Allow microphone access, confirm the Apollo is connected, and try again.",
      );
    }
  }
  async function beginEnrollment(profileId: string) {
    if (!voiceConsent || profileBusy) return;
    setProfileBusy(true);
    setProfileNotice("");
    try {
      const res = await fetch(`/api/vocal-profiles/${profileId}/challenge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rightsAttested: true, consentAccepted: true }),
        }),
        data = (await res.json()) as {
          challenge?: Omit<VocalChallenge, "profileId">;
          error?: { message: string };
        };
      if (!res.ok || !data.challenge)
        throw new Error(data.error?.message || "Could not begin enrollment.");
      setChallenge({ ...data.challenge, profileId });
      await loadProfiles();
    } catch (err) {
      setProfileNotice(
        err instanceof Error ? err.message : "Could not begin enrollment.",
      );
    } finally {
      setProfileBusy(false);
    }
  }
  async function uploadIdentityRecording(
    blob: Blob,
    duration: number,
    channelCount: number,
  ) {
    if (!challenge) return;
    setProfileBusy(true);
    try {
      const form = new FormData();
      form.set(
        "audio",
        new File(
          [blob],
          `identity-${challenge.verificationId}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`,
          { type: blob.type },
        ),
      );
      form.set("challengeToken", challenge.challengeToken);
      form.set("phrase", challenge.phrase);
      form.set("durationSeconds", String(duration));
      form.set("channelCount", String(channelCount));
      const res = await fetch(
          `/api/vocal-profiles/${challenge.profileId}/challenge/${challenge.verificationId}/recording`,
          { method: "POST", body: form },
        ),
        data = (await res.json()) as {
          verification?: {
            status: string;
            phraseMatchScore?: number;
            reasons?: string[];
          };
          error?: { message: string };
        };
      if (!res.ok || !data.verification)
        throw new Error(data.error?.message || "Could not save the recording.");
      setProfileNotice(
        data.verification.status === "PASSED"
          ? `Identity phrase verified locally · ${Math.round((data.verification.phraseMatchScore || 0) * 100)}% phrase match.`
          : `Identity verification did not pass${data.verification.reasons?.length ? `: ${data.verification.reasons.join(", ").toLowerCase().replaceAll("_", " ")}` : "."}`,
      );
      setChallenge(null);
      await loadProfiles();
    } catch (err) {
      setProfileNotice(
        err instanceof Error ? err.message : "Could not save the recording.",
      );
    } finally {
      setProfileBusy(false);
    }
  }
  async function uploadSingingRecording(
    blob: Blob,
    duration: number,
    profileId: string,
    channelCount: number,
    sourceType: "LIVE_SINGING" | "OWNED_VOCAL_BOUNCE" = "LIVE_SINGING",
    originalFilename?: string,
    refreshProfiles = true,
  ) {
    setProfileBusy(true);
    try {
      const extension = blob.type.includes("mp4")
          ? "m4a"
          : blob.type.includes("ogg")
            ? "ogg"
            : "webm",
        form = new FormData();
      form.set(
        "audio",
        new File([blob], originalFilename || `guided-singing.${extension}`, {
          type: blob.type,
        }),
      );
      form.set("durationSeconds", String(duration));
      form.set("channelCount", String(channelCount));
      form.set("sourceType", sourceType);
      const res = await fetch(
          `/api/vocal-profiles/${profileId}/singing-sources`,
          { method: "POST", body: form },
        ),
        responseText = await res.text();
      let data: {
          source?: { analysisStatus: string };
          error?: { message: string };
        } = {};
      try {
        data = JSON.parse(responseText) as typeof data;
      } catch {
        if (!res.ok)
          throw new Error(
            res.status === 413
              ? "One import segment exceeded the server upload limit."
              : responseText || `Upload failed (${res.status}).`,
          );
      }
      if (!res.ok || !data.source)
        throw new Error(
          data.error?.message || "Could not save the singing sample.",
        );
      setProfileNotice(
        sourceType === "OWNED_VOCAL_BOUNCE"
          ? "Vocal file imported privately. Audio quality, range, and usable duration analysis are pending."
          : "Guided singing saved privately. Audio quality, range, and usable duration analysis are pending.",
      );
      if (refreshProfiles) await loadProfiles();
      return true;
    } catch (err) {
      setProfileNotice(
        err instanceof Error
          ? err.message
          : "Could not save the singing sample.",
      );
      return false;
    } finally {
      setProfileBusy(false);
    }
  }
  async function importVocalFile(profileId: string, file: File) {
    if (!voiceConsent) {
      setProfileNotice(
        "Confirm that you own or control this vocal recording before importing it.",
      );
      return;
    }
    setImportProgress({
      profileId,
      fileName: file.name,
      stage: "READING",
      message: "Reading audio and checking duration and channels…",
    });
    setProfileBusy(true);
    try {
      const mimeByExtension: Record<string, string> = {
          wav: "audio/wav",
          flac: "audio/flac",
          mp3: "audio/mpeg",
          m4a: "audio/mp4",
          mp4: "audio/mp4",
          ogg: "audio/ogg",
          webm: "audio/webm",
        },
        extension = file.name.split(".").pop()?.toLowerCase() || "",
        typedFile = file.type
          ? file
          : new File([file], file.name, {
              type: mimeByExtension[extension] || "application/octet-stream",
            }),
        context = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(await typedFile.arrayBuffer());
      } finally {
        void context.close();
      }
      if (decoded.duration < 15 || decoded.duration > 1200)
        throw new Error("Choose a vocal file between 15 seconds and 20 minutes.");
      if (decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2)
        throw new Error("Choose a mono or stereo vocal file.");
      const targetRate = 48000,
        offline = new OfflineAudioContext(
          1,
          Math.ceil(decoded.duration * targetRate),
          targetRate,
        ),
        source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering(),
        samples = rendered.getChannelData(0),
        targetChunkSeconds = 8,
        chunkCount = Math.ceil(decoded.duration / targetChunkSeconds),
        samplesPerChunk = Math.ceil(samples.length / chunkCount),
        baseName = file.name.replace(/\.[^.]+$/, "") || "vocal";
      let saved = true;
      for (let part = 0; part < chunkCount; part += 1) {
        const start = part * samplesPerChunk,
          end = Math.min(samples.length, start + samplesPerChunk),
          partSamples = samples.slice(start, end),
          partBlob = encodeMonoPcm16Wav(partSamples, targetRate),
          partDuration = partSamples.length / targetRate,
          partName = `${baseName}.part-${String(part + 1).padStart(2, "0")}-of-${String(chunkCount).padStart(2, "0")}.wav`;
        setImportProgress({
          profileId,
          fileName: file.name,
          stage: "UPLOADING",
          message: `Uploading part ${part + 1} of ${chunkCount} securely (${Math.ceil(partBlob.size / 1024 / 1024)} MB)…`,
        });
        const partSaved = await uploadSingingRecording(
          partBlob,
          partDuration,
          profileId,
          1,
          "OWNED_VOCAL_BOUNCE",
          partName,
          false,
        );
        if (!partSaved) {
          saved = false;
          break;
        }
      }
      await loadProfiles();
      setImportProgress({
        profileId,
        fileName: file.name,
        stage: saved ? "SAVED" : "FAILED",
        message: saved
          ? `Import complete · ${chunkCount} parts saved. Ready for vocal analysis.`
          : "Import failed. See the message above and try again.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not import the vocal file.";
      setProfileNotice(
        message,
      );
      setImportProgress({
        profileId,
        fileName: file.name,
        stage: "FAILED",
        message,
      });
    } finally {
      setProfileBusy(false);
    }
  }
  async function analyzeProfile(profileId: string) {
    setProfileError("");
    setProfileBusy(true);
    setProfileNotice("Analyzing saved vocal recordings…");
    setAnalysisProgress({
      profileId,
      processed: 0,
      total: 0,
      running: true,
    });
    try {
      let processed = 0,
        passed = 0,
        total = 0,
        usableSeconds = 0;
      while (true) {
        const response = await fetch(`/api/vocal-profiles/${profileId}/analyze`, {
          method: "POST",
        }),
          data = (await response.json()) as {
            results?: Array<{ passed: boolean }>;
            pendingBefore?: number;
            pendingRemaining?: number;
            usableSingingSeconds?: number;
            error?: { message: string };
          };
        if (!response.ok || !data.results)
          throw new Error(data.error?.message || "Vocal analysis failed.");
        if (!total) total = processed + (data.pendingBefore || 0);
        if (total === 0 && data.results.length === 0) {
          setAnalysisProgress(null);
          break;
        }
        processed += data.results.length;
        passed += data.results.filter((result) => result.passed).length;
        usableSeconds = data.usableSingingSeconds || 0;
        setAnalysisProgress({
          profileId,
          processed,
          total,
          running: (data.pendingRemaining || 0) > 0,
        });
        if (!data.pendingRemaining || data.results.length === 0) break;
      }
      setProfileNotice(
        total
          ? `${passed} of ${total} pending takes passed. ${Math.round(usableSeconds)}s of singing is usable.`
          : "No pending vocal takes remain to analyze.",
      );
      await loadProfiles();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Vocal analysis failed.";
      setProfileNotice(message);
      setProfileError(message);
    } finally {
      setProfileBusy(false);
      setAnalysisProgress((progress) =>
        progress ? { ...progress, running: false } : null,
      );
    }
  }
  async function deleteVocalImport(
    profileId: string,
    source: VocalProfile["sources"][number],
    sources: VocalProfile["sources"],
  ) {
    const name = importedPerformanceName(source.originalFilename),
      summary = voiceSourceSummary(source, sources);
    if (
      !window.confirm(
        `Permanently delete "${name}" and all ${summary.partCount} stored parts? This removes ${Math.round(summary.usableSeconds)} usable seconds from this vocal profile.`,
      )
    )
      return;
    setProfileBusy(true);
    setProfileNotice(`Deleting ${name} securely…`);
    try {
      const response = await fetch(
          `/api/vocal-profiles/${profileId}/sources/${source.id}`,
          { method: "DELETE" },
        ),
        payload = (await response.json()) as {
          deleted?: { sourceCount: number; usableSecondsRemoved: number };
          error?: { message: string };
        };
      if (!response.ok || !payload.deleted)
        throw new Error(payload.error?.message || "The vocal import could not be deleted.");
      setProfileNotice(
        `${name} deleted · ${payload.deleted.sourceCount} stored parts and ${Math.round(payload.deleted.usableSecondsRemoved)} usable seconds removed.`,
      );
      await loadProfiles();
    } catch (error) {
      setProfileNotice(
        error instanceof Error ? error.message : "The vocal import could not be deleted.",
      );
    } finally {
      setProfileBusy(false);
    }
  }
  function discardPreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setProfileNotice("Take discarded. Nothing was uploaded.");
  }
  async function keepPreview() {
    if (!preview) return;
    const take = preview;
    setPreview(null);
    URL.revokeObjectURL(take.url);
    if (take.kind === "identity")
      await uploadIdentityRecording(
        take.blob,
        take.duration,
        take.channelCount,
      );
    else
      await uploadSingingRecording(
        take.blob,
        take.duration,
        take.profileId,
        take.channelCount,
      );
  }
  async function startRecording(
    kind: "identity" | "singing" = "identity",
    profileId?: string,
  ) {
    if (
      recording ||
      (kind === "identity" && !challenge) ||
      (kind === "singing" && !profileId)
    )
      return;
    setProfileNotice("");
    try {
      if (!monitorStream.current) await setupMicrophone();
      if (!monitorStream.current)
        throw new Error("Set up the microphone before recording.");
      const stream = monitorStream.current.clone(),
        mimeType =
          ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(
            (type) => MediaRecorder.isTypeSupported(type),
          ) || "",
        mediaRecorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        ),
        maximumSeconds = kind === "identity" ? 15 : 60;
      recordingChunks.current = [];
      recordingElapsed.current = 0;
      recordingTargetProfile.current =
        profileId || challenge?.profileId || null;
      setRecordingKind(kind);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const duration = recordingElapsed.current,
          blob = new Blob(recordingChunks.current, {
            type: mediaRecorder.mimeType || "audio/webm",
          }),
          targetProfile = recordingTargetProfile.current,
          channelCount = Math.max(
            1,
            Math.min(
              2,
              Number(stream.getAudioTracks()[0]?.getSettings().channelCount) ||
                1,
            ),
          );
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        setRecording(false);
        setRecordingKind(null);
        setRecordingSeconds(0);
        if (targetProfile) {
          if (preview) URL.revokeObjectURL(preview.url);
          setPreview({
            blob,
            url: URL.createObjectURL(blob),
            kind,
            profileId: targetProfile,
            duration,
            channelCount,
          });
          setProfileNotice(
            "Take finished. Listen before choosing Keep recording or Discard.",
          );
        }
      };
      recorder.current = mediaRecorder;
      setRecordingSeconds(0);
      setRecording(true);
      mediaRecorder.start(500);
      recordingTimer.current = setInterval(() => {
        recordingElapsed.current += 1;
        setRecordingSeconds(recordingElapsed.current);
        if (
          recordingElapsed.current >= maximumSeconds &&
          mediaRecorder.state === "recording"
        )
          mediaRecorder.stop();
      }, 1000);
    } catch {
      setProfileNotice(
        "Microphone access was not available. Allow microphone access in the browser and try again.",
      );
    }
  }
  function stopRecording() {
    const minimum = recordingKind === "singing" ? 15 : 8;
    if (recordingSeconds < minimum) {
      setProfileNotice(
        `Keep recording for at least ${minimum} seconds before saving.`,
      );
      return;
    }
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  const filtered = useMemo(
    () =>
      songs
        .filter((song) =>
          (song.title + song.prompt)
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .filter((song) => {
          if (librarySource === "imported") return song.provider === "user-upload";
          if (librarySource === "generated") return song.provider !== "user-upload";
          if (librarySource === "my-voice") return Boolean(song.vocalist);
          return true;
        })
        .sort((left, right) => {
          const difference =
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          return librarySort === "newest" ? difference : -difference;
        }),
    [songs, search, librarySort, librarySource],
  );
  const visibleLibrarySongs = filtered.slice(0, libraryVisibleCount);
  if (user === undefined)
    return (
      <div className="boot">
        <span>dz</span>
        <p>Opening your studio…</p>
      </div>
    );
  if (!user) return <AuthGate onAuthenticated={setUser} />;
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <span>dz</span>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={view === "create" ? "active" : ""}
            onClick={() => setView("create")}
          >
            <Icon name="create" />
            <span>Create</span>
          </button>
          <button
            className={view === "library" ? "active" : ""}
            onClick={() => setView("library")}
          >
            <Icon name="library" />
            <span>Library</span>
          </button>
          <button
            className={view === "voice" ? "active" : ""}
            onClick={() => {
              setView("voice");
              void loadProfiles();
            }}
          >
            <Icon name="voice" />
            <span>My Voice</span>
          </button>
        </nav>
        <div className="rail-bottom">
          <button
            className="avatar"
            aria-label="Sign out"
            title={`Sign out ${user.email}`}
            onClick={logout}
          >
            {user.displayName.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <p>DOZI MUSIC STUDIO</p>
            <h1>
              {view === "create"
                ? "Create"
                : view === "library"
                  ? "Your library"
                  : view === "tracks"
                    ? "Multitrack workspace"
                    : "Artist voice"}
            </h1>
          </div>
          <div className="provider" title={provider.model}>
            <i />
            {provider.name === "elevenlabs"
              ? "Powered by ElevenLabs"
              : provider.name === "acestep"
                ? "ACE-Step"
                : provider.name === "mock"
                  ? "Mock engine"
                  : provider.name}{" "}
            <span>
              {provider.available
                ? `Server ready · ${provider.masterGeneration.toLowerCase()}`
                : "Unavailable"}
            </span>
          </div>
        </header>
        {activeGenerationJobs.length > 0 && (
          <aside className="operation-status" role="status" aria-live="polite">
            <div className="operation-status-title">
              <i aria-hidden="true" />
              <div>
                <strong>Dozi is working</strong>
                <span>
                  {activeGenerationJobs.length === 1
                    ? "Your song is being created. This status refreshes automatically."
                    : `${activeGenerationJobs.length} songs are being created. This status refreshes automatically.`}
                </span>
              </div>
            </div>
            <div className="operation-status-jobs">
              {activeGenerationJobs.slice(0, 2).map((song) => (
                <div key={song.id}>
                  <span>{song.title}</span>
                  <strong>
                    {labels[song.status]} · {song.progress}%
                  </strong>
                </div>
              ))}
              {activeGenerationJobs.length > 2 && (
                <small>+{activeGenerationJobs.length - 2} more in progress</small>
              )}
            </div>
            <button onClick={() => void loadSongs()}>Check now</button>
          </aside>
        )}
        {view === "create" ? (
          <div className="workspace">
            <section className="composer">
              <div className="mode-tabs">
                {(["Simple", "Advanced"] as const).map((m) => (
                  <button
                    key={m}
                    className={mode === m ? "active" : ""}
                    onClick={() => setMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="field-label" htmlFor="idea">
                SONG IDEA <span>{prompt.length}/500</span>
              </label>
              <textarea
                id="idea"
                value={prompt}
                maxLength={500}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the song you want to make…"
              />
              <div className="toggle-row">
                <div>
                  <strong>Instrumental</strong>
                  <small>Create without vocals</small>
                </div>
                <button
                  role="switch"
                  aria-checked={instrumental}
                  className={`switch ${instrumental ? "on" : ""}`}
                  onClick={() => setInstrumental((v) => !v)}
                >
                  <i />
                </button>
              </div>
              {!instrumental && (
                <>
                  <div
                    className={`vocalist-selector ${selectedVocalProfileId ? "active" : ""}`}
                  >
                    <div>
                      <span>VOCALIST</span>
                      <strong>
                        {selectedVocalProfileId ? "Private artist voice" : "Generated vocalist"}
                      </strong>
                    </div>
                    <select
                      aria-label="Vocalist"
                      value={selectedVocalProfileId}
                      onChange={(event) => setSelectedVocalProfileId(event.target.value)}
                    >
                      <option value="">Provider vocalist</option>
                      {activeVocalProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} · My Voice V{profile.activeVersionNumber}
                        </option>
                      ))}
                    </select>
                    <small>
                      {selectedVocalProfileId
                        ? "Dozi keeps the generated melody and phrasing, applies your approved private voice locally, and retains the untouched provider master. This adds processing time."
                        : activeVocalProfiles.length
                          ? "Choose a trained My Voice profile, or keep the vocalist created by the music provider."
                          : "Create and activate a trained profile in My Voice to sing with your own voice."}
                    </small>
                  </div>
                  <div className="section-head">
                    <span>LYRICS</span>
                    <button
                      onClick={() =>
                        setLyrics(
                          "[Verse 1]\nThe road got quiet, but I kept the light\n\n[Chorus]\nPurpose finds us in its own sweet time",
                        )
                      }
                    >
                      Generate for me <Icon name="spark" />
                    </button>
                  </div>
                  <textarea
                    className="lyrics"
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Leave blank and Dozi will write lyrics, or add your own…"
                  />
                </>
              )}
              {mode === "Advanced" && (
                <div className="advanced-grid">
                  <label>
                    Genre
                    <input value={plan.genre} readOnly />
                  </label>
                  <label>
                    BPM
                    <input
                      type="number"
                      min="40"
                      max="220"
                      value={songBpm}
                      onChange={(event) => {
                        const next = event.target.valueAsNumber;
                        if (Number.isFinite(next))
                          setSongBpm(Math.max(40, Math.min(220, Math.round(next))));
                      }}
                    />
                  </label>
                  <label>
                    Key
                    <select
                      value={`${songKey}:${songScale}`}
                      onChange={(event) => {
                        const [nextKey, nextScale] = event.target.value.split(":");
                        setSongKey(nextKey);
                        setSongScale(nextScale as "major" | "minor");
                      }}
                    >
                      {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].flatMap(
                        (key) =>
                          (["major", "minor"] as const).map((scale) => (
                            <option key={`${key}:${scale}`} value={`${key}:${scale}`}>
                              {key} {scale}
                            </option>
                          )),
                      )}
                    </select>
                  </label>
                  <label>
                    Duration
                    <select
                      value={durationSeconds}
                      onChange={(e) =>
                        setDurationSeconds(Number(e.target.value))
                      }
                    >
                      <option value={12}>12 seconds</option>
                      {["elevenlabs", "minimax"].includes(provider.name) && (
                        <option value={30}>30 seconds</option>
                      )}
                    </select>
                  </label>
                </div>
              )}
              <button
                className="blueprint-toggle"
                onClick={() => setBlueprint((v) => !v)}
              >
                <span>
                  <Icon name="spark" /> Song Blueprint
                </span>
                <Icon name="chevron" />
              </button>
              {blueprint && (
                <div className="blueprint">
                  <div>
                    <small>STYLE</small>
                    <strong>{plan.genre}</strong>
                  </div>
                  <div>
                    <small>TEMPO</small>
                    <strong>{plan.bpm} BPM</strong>
                  </div>
                  <div>
                    <small>TONALITY</small>
                    <strong>{plan.key}</strong>
                  </div>
                  <div>
                    <small>FEEL</small>
                    <strong>{plan.mood}</strong>
                  </div>
                  <p>
                    <i />
                    Sparse Rhodes and restrained pocket drums leave room for the
                    final chorus to open up.
                  </p>
                </div>
              )}
              {provider.name === "elevenlabs" && (
                <label className="provider-policy">
                  <input
                    type="checkbox"
                    checked={providerPolicyAccepted}
                    onChange={(e) =>
                      setProviderPolicyAccepted(e.target.checked)
                    }
                  />
                  <span>
                    <strong>Rights confirmation</strong>
                    <small>
                      I have rights to this prompt and its lyrics. They will be
                      sent to ElevenLabs for generation. Artist imitation and
                      copyrighted lyrics are not permitted.
                    </small>
                  </span>
                </label>
              )}
              <button
                className="generate"
                onClick={generate}
                disabled={
                  !prompt.trim() ||
                  submitting ||
                  (provider.name === "elevenlabs" && !providerPolicyAccepted)
                }
              >
                <Icon name="spark" /> {submitting ? "Starting…" : "Generate"}
                <kbd>⌘ ↵</kbd>
              </button>
              {notice ? (
                <p className="form-notice" role="alert">
                  {notice}
                </p>
              ) : (
                <p className="fineprint">
                  Creates a server-side{" "}
                  {selectedVocalProfileId && !instrumental
                    ? "WAV master with private vocalist"
                    : provider.name === "elevenlabs"
                      ? "MP3 master"
                      : "WAV master"}{" "}
                  ·{" "}
                  {provider.name === "acestep" ? "ACE-Step" : provider.name}
                </p>
              )}
            </section>
            <section className="results">
              <div className="results-head">
                <div>
                  <h2>Generations</h2>
                  <span>{songs.length} songs</span>
                </div>
                <div className="results-actions">
                  <button onClick={() => setSongImportOpen(true)}>
                    Import full song
                  </button>
                  <button onClick={() => setRepairImportOpen(true)}>
                    Import vocal for repair
                  </button>
                  <button onClick={loadSongs}>Refresh</button>
                </div>
              </div>
              <div className="result-list">
                {songs.length === 0 ? (
                  <div className="empty">
                    <Icon name="spark" />
                    <h3>Your next sound starts here</h3>
                    <p>
                      Describe a song and generate your first durable version.
                    </p>
                  </div>
                ) : (
                  songs.map((s, i) => (
                    <SongCard
                      key={s.id}
                      song={s}
                      tone={i % 3}
                      active={active}
                      playing={playing}
                      time={time}
                      onPlay={play}
                      onOpen={(song) => void openWorkspace(song)}
                      onRepair={(song) => {
                        setPlaying(false);
                        setRepairSong(song);
                        void loadProfiles();
                      }}
                      onSeek={(p) => playFromSongWaveform(s, p)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        ) : view === "library" ? (
          <section className="library-view">
            <div className="library-tools">
              <div className="search">
                <Icon name="search" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLibraryVisibleCount(24);
                  }}
                  placeholder="Search songs and prompts"
                />
              </div>
              <div className="library-actions">
                <button onClick={() => setSongImportOpen(true)}>
                  Import full song
                </button>
                <div className="library-view-toggle" role="group" aria-label="Library layout">
                  <button
                    className={libraryView === "grid" ? "active" : ""}
                    aria-pressed={libraryView === "grid"}
                    onClick={() => setLibraryView("grid")}
                  >
                    Grid
                  </button>
                  <button
                    className={libraryView === "list" ? "active" : ""}
                    aria-pressed={libraryView === "list"}
                    onClick={() => setLibraryView("list")}
                  >
                    List
                  </button>
                </div>
                <select
                  aria-label="Filter library"
                  value={librarySource}
                  onChange={(event) => {
                    setLibrarySource(
                      event.target.value as
                        | "all"
                        | "generated"
                        | "imported"
                        | "my-voice",
                    );
                    setLibraryVisibleCount(24);
                  }}
                >
                  <option value="all">All songs</option>
                  <option value="generated">Generated</option>
                  <option value="imported">Imported</option>
                  <option value="my-voice">My Voice</option>
                </select>
                <select
                  aria-label="Sort library"
                  value={librarySort}
                  onChange={(event) => {
                    setLibrarySort(event.target.value as "newest" | "oldest");
                    setLibraryVisibleCount(24);
                  }}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            {libraryNotice && (
              <p className="library-notice" role="status">
                {libraryNotice}
              </p>
            )}
            {filtered.length ? (
              <>
              <div className={`library-grid ${libraryView === "list" ? "list" : ""}`}>
                {visibleLibrarySongs.map((s, i) => (
                  <article key={s.id}>
                    <div className="library-cover" data-tone={i % 3}>
                      <button
                        disabled={!s.audioUrl}
                        onClick={() => play(s)}
                        aria-label={`Play ${s.title}`}
                      >
                        <Icon
                          name={
                            active?.id === s.id && playing ? "pause" : "play"
                          }
                        />
                      </button>
                      <span>DZ</span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>
                      {s.genre} · V{s.version}
                    </p>
                    <small>{new Date(s.createdAt).toLocaleString()}</small>
                    <div className="library-card-actions">
                      <button
                        className="library-open"
                        disabled={s.status !== "COMPLETE"}
                        onClick={() => void openWorkspace(s)}
                      >
                        Open tracks
                      </button>
                      {s.songId && (
                        <button
                          className="library-archive"
                          onClick={() => setArchiveCandidate(s)}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="library-results-footer">
                <span>
                  Showing {visibleLibrarySongs.length} of {filtered.length} songs
                </span>
                {visibleLibrarySongs.length < filtered.length && (
                  <button onClick={() => setLibraryVisibleCount((count) => count + 24)}>
                    Show 24 more
                  </button>
                )}
              </div>
              </>
            ) : (
              <div className="empty">
                <h3>No songs found</h3>
                <p>Try another search or create your first song.</p>
              </div>
            )}
          </section>
        ) : view === "tracks" ? (
          <section className="tracks-view">
            {workspaceBusy ? (
              <div className="tracks-loading" role="status">
                <i />
                <h2>Opening song workspace…</h2>
                <p>Loading versions and synchronized audio assets.</p>
              </div>
            ) : workspaceError ? (
              <div className="empty tracks-error" role="alert">
                <h3>Could not open the workspace</h3>
                <p>{workspaceError}</p>
                <button onClick={() => setView("library")}>Back to library</button>
              </div>
            ) : songWorkspace ? (
              <MultitrackWorkspace
                data={songWorkspace}
                onClose={() => setView("library")}
                onRefresh={async () => {
                  const res = await fetch(`/api/songs/${songWorkspace.song.id}`, {
                    cache: "no-store",
                  });
                  if (res.ok) setSongWorkspace((await res.json()) as SongWorkspace);
                }}
              />
            ) : null}
          </section>
        ) : (
          <section className="voice-view">
            <div className="voice-intro">
              <p>PRIVATE ARTIST IDENTITY</p>
              <h2>Make your voice selectable</h2>
              <span>
                Start a consent-protected singing profile. Dozi will require a
                live identity check. A short profile can be tested, while about
                10 minutes of clean singing is the current quality target for
                trained artist identity. Creating a profile does not clone or
                publish your voice.
              </span>
            </div>
            <form className="profile-create" onSubmit={createProfile}>
              <label>
                PROFILE NAME
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  placeholder="My Voice"
                />
              </label>
              <button
                className="generate"
                disabled={profileBusy || profileName.trim().length < 2}
              >
                {profileBusy ? "Creating…" : "Create private profile"}
              </button>
            </form>
            {profiles.length > 0 && (
              <label className="voice-consent">
                <input
                  type="checkbox"
                  checked={voiceConsent}
                  onChange={(e) => setVoiceConsent(e.target.checked)}
                />
                <span>
                  <strong>My voice and my authorization</strong>
                  <small>
                    I confirm this is my voice or an original recording I
                    control, and I authorize Dozi to use it only for my private
                    singing profile. I can revoke the profile later.
                  </small>
                </span>
              </label>
            )}
            {profiles.length > 0 && (
              <section className="mic-setup" aria-label="Microphone setup">
                <div className="mic-setup-head">
                  <div>
                    <small>INPUT DEVICE</small>
                    <strong>
                      {monitoring
                        ? "Signal monitor active"
                        : "Choose and test your microphone"}
                    </strong>
                  </div>
                  <button
                    className="enroll"
                    onClick={() => void setupMicrophone()}
                    disabled={recording}
                  >
                    {monitoring ? "Restart monitor" : "Set up microphone"}
                  </button>
                </div>
                {audioInputs.length > 0 && (
                  <>
                    <select
                      aria-label="Microphone input"
                      value={selectedInputId}
                      disabled={recording}
                      onChange={(event) =>
                        void setupMicrophone(event.target.value)
                      }
                    >
                      {audioInputs.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${index + 1}`}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Hardware input channel"
                      value={selectedInputChannel}
                      disabled={recording}
                      onChange={(event) => {
                        const channel = Number(event.target.value);
                        setSelectedInputChannel(channel);
                        void setupMicrophone(selectedInputId, channel);
                      }}
                    >
                      <option value={1}>Hardware input 1</option>
                      <option value={2}>Hardware input 2</option>
                    </select>
                  </>
                )}
                <div className="input-meter" aria-label="Live input level">
                  <i style={{ width: `${meterLevel}%` }} />
                </div>
                <p>
                  Speak or sing now. The meter should move into green without
                  staying at the far right.
                </p>
              </section>
            )}
            {profileNotice && (
              <p className="form-notice" role="status" aria-live="polite">
                {profileNotice}
              </p>
            )}
            {challenge && (
              <div className="voice-challenge" role="status">
                <small>
                  LIVE IDENTITY PHRASE · EXPIRES{" "}
                  {new Date(challenge.expiresAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
                <blockquote>{challenge.phrase}</blockquote>
                <p>
                  Say the complete phrase once, slowly and clearly. Then remain
                  quiet; recording stops automatically at 15 seconds.
                </p>
                <button
                  className={`record ${recordingKind === "identity" ? "active" : ""}`}
                  disabled={profileBusy || recordingKind === "singing"}
                  onClick={
                    recordingKind === "identity"
                      ? stopRecording
                      : () => void startRecording()
                  }
                >
                  <i />
                  {recordingKind === "identity"
                    ? `Stop and save · ${recordingSeconds}s`
                    : profileBusy
                      ? "Saving securely…"
                      : "Record live phrase"}
                </button>
              </div>
            )}
            {recordingKind === "singing" && (
              <div className="recording-banner" role="status">
                <i />
                <div>
                  <strong>
                    Recording guided singing · {recordingSeconds}s
                  </strong>
                  <small>
                    Sing a comfortable verse and chorus. Multiple varied takes
                    can be combined toward the 10-minute quality target.
                  </small>
                </div>
                <button onClick={stopRecording}>Stop</button>
              </div>
            )}
            {preview && (
              <section className="take-preview">
                <div>
                  <small>REVIEW BEFORE UPLOAD</small>
                  <strong>
                    {preview.kind === "identity"
                      ? "Live identity phrase"
                      : "Guided singing take"}{" "}
                    · {preview.duration}s
                  </strong>
                </div>
                <audio controls src={preview.url} />
                <div className="take-actions">
                  <button onClick={discardPreview}>Discard</button>
                  <button
                    onClick={() => void keepPreview()}
                    disabled={profileBusy}
                  >
                    {profileBusy ? "Uploading…" : "Keep recording"}
                  </button>
                </div>
              </section>
            )}
            <div className="profile-list">
              {profiles.map((p) => (
                <article key={p.id}>
                  <div className="profile-mic">
                    <Icon name="voice" />
                  </div>
                  <div>
                    <div className="profile-title">
                      <h3>{p.name}</h3>
                      <span>{p.status.toLowerCase()}</span>
                    </div>
                    <p>
                      {p.sourceCount} recordings ·{" "}
                      {Math.round(p.usableSingingSeconds)}s usable singing
                    </p>
                    {p.verifiedAt && (
                      <p className="form-notice" role="status">
                        Identity phrase verified locally
                        {p.latestPhraseMatchScore !== null
                          ? ` · ${Math.round(p.latestPhraseMatchScore * 100)}% phrase match`
                          : ""}
                      </p>
                    )}
                    <div className="profile-progress">
                      <i
                        style={{
                          width: `${Math.min(100, (p.usableSingingSeconds / 600) * 100)}%`,
                        }}
                      />
                    </div>
                    {p.sources?.length > 0 && (
                      <div className="voice-takes">
                        <strong>Saved private takes</strong>
                        {visibleVoiceSources(p.sources).map((source, index) => {
                          const summary = voiceSourceSummary(source, p.sources);
                          return <div className="voice-take" key={source.id}>
                            <div>
                              <span>
                                {source.sourceType === "LIVE_SPEECH"
                                  ? "Identity phrase"
                                  : source.sourceType === "OWNED_VOCAL_BOUNCE"
                                    ? importedPerformanceName(source.originalFilename)
                                    : source.sourceType === "SEPARATED_OWNED_MIX"
                                      ? "Imported song vocal"
                                      : `Singing take ${p.sources.filter((item) => item.sourceType === "LIVE_SINGING").length - p.sources.slice(0, index).filter((item) => item.sourceType === "LIVE_SINGING").length}`}
                              </span>
                              <small>
                                {Math.round(summary.durationSeconds)}s
                                {summary.partCount > 1
                                  ? ` · ${summary.partCount} securely stored parts`
                                  : ""}{" "}
                                · {summary.analysisStatus.toLowerCase()}
                                {summary.qualityScore !== null
                                  ? ` · quality ${Math.round(summary.qualityScore)}`
                                  : ""}
                              </small>
                            </div>
                            <div className="voice-take-media">
                              <audio controls preload="none" src={source.audioUrl} />
                              {source.sourceType === "OWNED_VOCAL_BOUNCE" && (
                                <button
                                  className="delete-voice-import"
                                  disabled={profileBusy}
                                  onClick={() =>
                                    void deleteVocalImport(p.id, source, p.sources)
                                  }
                                >
                                  Delete import
                                </button>
                              )}
                            </div>
                          </div>
                        })}
                      </div>
                    )}
                    <small>
                      {p.status === "DRAFT"
                        ? "Next: accept the terms and begin the live identity challenge."
                        : p.status === "ACTIVE"
                          ? "Ready to use for supported singing generation."
                          : "Enrollment is in progress."}
                    </small>
                    {p.status !== "ACTIVE" && p.status !== "REVOKED" && (
                      <button
                        className="enroll"
                        disabled={
                          profileBusy ||
                          recording ||
                          !!preview ||
                          (p.status === "DRAFT" && !voiceConsent)
                        }
                        onClick={() =>
                          p.status === "DRAFT"
                            ? void beginEnrollment(p.id)
                            : void startRecording("singing", p.id)
                        }
                      >
                        {p.status === "DRAFT"
                          ? "Begin identity enrollment"
                          : "Record singing sample"}
                      </button>
                    )}
                    {p.status !== "DRAFT" && p.status !== "REVOKED" && (
                      <label className="enroll import-vocal">
                        {profileBusy ? "Importing…" : "Import vocal file"}
                        <input
                          type="file"
                          accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.wav,.flac,.mp3,.m4a,.ogg,.webm"
                          disabled={profileBusy || recording || !!preview}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void importVocalFile(p.id, file);
                          }}
                        />
                      </label>
                    )}
                    {importProgress?.profileId === p.id && (
                      <div
                        className={`import-progress ${importProgress.stage.toLowerCase()}`}
                        role="status"
                        aria-live="polite"
                      >
                        {(importProgress.stage === "READING" ||
                          importProgress.stage === "UPLOADING") && (
                          <progress aria-label="Vocal import in progress" />
                        )}
                        <div>
                          <strong>{importProgress.fileName}</strong>
                          <span>{importProgress.message}</span>
                        </div>
                      </div>
                    )}
                    {p.status !== "DRAFT" && p.status !== "REVOKED" && (
                      <button
                        className="enroll"
                        disabled={
                          profileBusy ||
                          recording ||
                          !!preview ||
                          !p.sources?.some(
                            (source) =>
                              source.sourceType !== "LIVE_SPEECH" &&
                              source.analysisStatus === "PENDING",
                          )
                        }
                        onClick={() => void analyzeProfile(p.id)}
                      >
                        {profileBusy
                          ? "Analyzing…"
                          : p.sources?.some(
                                (source) =>
                                  source.sourceType !== "LIVE_SPEECH" &&
                                  source.analysisStatus === "PENDING",
                              )
                            ? "Analyze pending singing takes"
                            : "Singing analysis complete"}
                      </button>
                    )}
                    {p.status !== "DRAFT" && p.status !== "REVOKED" && (
                      <button
                        className="enroll"
                        disabled={
                          profileBusy ||
                          recording ||
                          !!preview ||
                          !voiceConsent
                        }
                        onClick={() => void beginEnrollment(p.id)}
                      >
                        Redo identity phrase
                      </button>
                    )}
                    {analysisProgress?.profileId === p.id && (
                      <div className="analysis-progress" role="status">
                        <progress
                          max={Math.max(1, analysisProgress.total)}
                          value={analysisProgress.processed}
                        />
                        <span>
                          {analysisProgress.running
                            ? analysisProgress.total
                              ? `Analyzing take ${Math.min(analysisProgress.processed + 1, analysisProgress.total)} of ${analysisProgress.total}…`
                              : "Preparing saved takes…"
                            : `Analysis finished · ${analysisProgress.processed} of ${analysisProgress.total} processed`}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {profiles.length === 0 && (
                <div className="empty">
                  <Icon name="voice" />
                  <h3>No artist voice yet</h3>
                  <p>Create a private profile to begin guided enrollment.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <footer
        className={`player ${active && view !== "tracks" ? "visible" : ""}`}
      >
        {/* Music is instrumental/generated; captions are not applicable. */}
        <audio
          ref={audio}
          src={active?.audioUrl}
          onLoadedMetadata={(event) => {
            const start = pendingSongStart.current;
            if (start === null) return;
            const element = event.currentTarget;
            element.currentTime = Math.min(start, element.duration || start);
            pendingSongStart.current = null;
            setTime(element.currentTime);
            if (playing) void element.play().catch(() => setPlaying(false));
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
        <div className="now">
          <div className="mini-cover">DZ</div>
          <div>
            <strong>{active?.title || "Choose a song"}</strong>
            <span>
              {active
                ? `${active.genre} · Version ${active.version}`
                : "Nothing playing"}
            </span>
          </div>
        </div>
        <div className="transport">
          <div>
            <button aria-label="Previous">
              <Icon name="skip" />
            </button>
            <button
              className="main-play"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => active && setPlaying((v) => !v)}
            >
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <button aria-label="Next">
              <Icon name="skip" />
            </button>
          </div>
          {active && (
            <div className="timeline">
              <span>{fmt(time)}</span>
              <Wave
                compact
                data={active.waveform}
                progress={time / active.duration}
                onSeek={(p) => {
                  setTime(p * active.duration);
                  if (audio.current)
                    audio.current.currentTime = p * active.duration;
                }}
              />
              <span>{fmt(active.duration)}</span>
            </div>
          )}
        </div>
        <div className="volume">
          <Icon name="volume" />
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step=".05"
            defaultValue=".8"
            onChange={(e) => {
              if (audio.current) audio.current.volume = Number(e.target.value);
            }}
          />
        </div>
      </footer>
      {repairSong && (
        <PhraseRepairModal
          song={repairSong}
          initialTime={active?.id === repairSong.id ? time : 0}
          profiles={profiles}
          onClose={() => setRepairSong(null)}
        />
      )}
      {repairImportOpen && (
        <VocalRepairImportModal
          onClose={() => setRepairImportOpen(false)}
          onImported={(song) => {
            setSongs((items) => [song, ...items]);
            setRepairImportOpen(false);
            setRepairSong(song);
            void loadProfiles();
          }}
        />
      )}
      {songImportOpen && (
        <FullSongImportModal
          onClose={() => setSongImportOpen(false)}
          onImported={(song) => {
            setSongs((items) => [song, ...items]);
            setSongImportOpen(false);
            void openWorkspace(song);
          }}
        />
      )}
      {profileError && (
        <div className="error-modal-backdrop" role="presentation">
          <section
            className="error-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="analysis-error-title"
          >
            <small>VOCAL ANALYSIS</small>
            <h2 id="analysis-error-title">Analysis could not continue</h2>
            <p>{profileError}</p>
            <p className="error-modal-help">
              Your imported audio remains saved. Close this message and try
              analysis again after checking that the AI gateway is running.
            </p>
            <button onClick={() => setProfileError("")}>
              Close
            </button>
          </section>
        </div>
      )}
      {archiveCandidate && (
        <div className="error-modal-backdrop" role="presentation">
          <section
            className="archive-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-song-title"
          >
            <small>ARCHIVE SONG</small>
            <h2 id="archive-song-title">Archive {archiveCandidate.title}?</h2>
            <p>
              This removes the song from your active Library. Its private audio
              and version history remain preserved and are not deleted.
            </p>
            <div>
              <button disabled={archiveBusy} onClick={() => setArchiveCandidate(null)}>
                Keep song
              </button>
              <button disabled={archiveBusy} onClick={() => void archiveLibrarySong()}>
                {archiveBusy ? "Archiving…" : "Archive song"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function FullSongImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (song: Song) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [bpm, setBpm] = useState(120),
    [keyScale, setKeyScale] = useState("C:major"),
    [rightsAttested, setRightsAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !rightsAttested || busy || !title.trim()) return;
    setBusy(true);
    setError("");
    setMessage("Reading and checking the song…");
    try {
      const decoder = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await decoder.decodeAudioData(await file.arrayBuffer());
      } finally {
        await decoder.close();
      }
      if (decoded.duration < 1 || decoded.duration > 600)
        throw new Error("Choose a song between 1 second and 10 minutes long.");
      setMessage("Preparing a private studio-quality master…");
      const sampleRate = 48000,
        renderer = new OfflineAudioContext(
          2,
          Math.ceil(decoded.duration * sampleRate),
          sampleRate,
        ),
        source = renderer.createBufferSource();
      source.buffer = decoded;
      source.connect(renderer.destination);
      source.start();
      const rendered = await renderer.startRendering(),
        wav = encodeStereoPcm16Wav(rendered);
      if (wav.size > 120 * 1024 * 1024)
        throw new Error("This song is too large after preparation. Choose a shorter file.");
      setMessage("Saving the song securely…");
      const form = new FormData(),
        [musicalKey, scale] = keyScale.split(":");
      form.set(
        "audio",
        new File([wav], `${title.trim()}.wav`, { type: "audio/wav" }),
      );
      form.set("title", title.trim());
      form.set("bpm", String(bpm));
      form.set("key", musicalKey);
      form.set("scale", scale);
      form.set("rightsAttested", "true");
      const response = await fetch("/api/songs/import", {
          method: "POST",
          body: form,
        }),
        responseText = await response.text();
      let payload: { song?: Song; error?: { message: string } } = {};
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        if (response.status === 413)
          throw new Error("The prepared song exceeded the local upload limit.");
        throw new Error(responseText.trim() || "The song could not be imported.");
      }
      if (!response.ok || !payload.song)
        throw new Error(payload.error?.message || "The song could not be imported.");
      setMessage("Import complete. Opening the workspace…");
      onImported(payload.song);
    } catch (reason) {
      setMessage("");
      setError(reason instanceof Error ? reason.message : "The song could not be imported.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="repair-modal-backdrop" role="presentation">
      <section
        className="repair-modal repair-import-modal song-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-import-title"
      >
        <div className="repair-modal-head">
          <div>
            <small>PRIVATE SONG IMPORT</small>
            <h2 id="song-import-title">Import a full song</h2>
          </div>
          <button aria-label="Close song import" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="repair-import-help">
          Choose a full mix that you own or control. Dozi keeps the original
          private and creates derived stems for editing without changing it.
        </p>
        <form className="repair-form" onSubmit={submit}>
          <label className="repair-file-picker">
            SONG FILE
            <input
              type="file"
              accept="audio/*,.wav,.flac,.mp3,.m4a,.aiff,.aif,.ogg"
              required
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                setFile(selected);
                if (selected && !title)
                  setTitle(selected.name.replace(/\.[^.]+$/, ""));
                setError("");
              }}
            />
          </label>
          <label>
            SONG TITLE
            <input
              value={title}
              maxLength={120}
              required
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="song-import-grid">
            <label>
              BPM
              <input
                type="number"
                min="40"
                max="220"
                value={bpm}
                disabled={busy}
                onChange={(event) => setBpm(event.target.valueAsNumber)}
              />
            </label>
            <label>
              KEY
              <select
                value={keyScale}
                disabled={busy}
                onChange={(event) => setKeyScale(event.target.value)}
              >
                {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].flatMap(
                  (key) =>
                    (["major", "minor"] as const).map((scale) => (
                      <option key={`${key}:${scale}`} value={`${key}:${scale}`}>
                        {key} {scale}
                      </option>
                    )),
                )}
              </select>
            </label>
          </div>
          <label className="repair-attestation">
            <input
              type="checkbox"
              checked={rightsAttested}
              disabled={busy}
              onChange={(event) => setRightsAttested(event.target.checked)}
            />
            <span>
              <strong>I own or control this song recording</strong>
              <small>It will remain private within my Dozi account.</small>
            </span>
          </label>
          <button
            className="repair-primary"
            disabled={!file || !title.trim() || !rightsAttested || busy}
          >
            {busy ? "Importing…" : "Import and open workspace"}
          </button>
        </form>
        {message && <p className="song-import-status" role="status">{message}</p>}
        {error && <p className="repair-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function VocalRepairImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (song: Song) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [rightsAttested, setRightsAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !rightsAttested || busy) return;
    setBusy(true);
    setError("");
    try {
      const context = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(await file.arrayBuffer());
      } finally {
        void context.close();
      }
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1)
          mono[index] += samples[index] / decoded.numberOfChannels;
      }
      const wav = encodeMonoPcm16Wav(mono, decoded.sampleRate),
        baseName = file.name.replace(/\.[^.]+$/, "") || "Imported vocal",
        form = new FormData();
      form.set(
        "audio",
        new File([wav], `${baseName}.wav`, { type: "audio/wav" }),
      );
      form.set("durationSeconds", String(decoded.duration));
      form.set("sampleRate", String(decoded.sampleRate));
      form.set("rightsAttested", "true");
      form.set("title", `Vocal repair · ${baseName}`);
      const response = await fetch("/api/vocal-repairs/import-source", {
          method: "POST",
          body: form,
        }),
        data = (await response.json()) as {
          song?: Song;
          error?: { message: string };
        };
      if (!response.ok || !data.song)
        throw new Error(data.error?.message || "Could not import the vocal source.");
      onImported(data.song);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not import the vocal source.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="repair-modal-backdrop" role="presentation">
      <section
        className="repair-modal repair-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repair-import-title"
      >
        <div className="repair-modal-head">
          <div>
            <small>PRIVATE VOCAL IMPORT</small>
            <h2 id="repair-import-title">Import a vocal to repair</h2>
          </div>
          <button aria-label="Close vocal import" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="repair-import-help">
          Choose the original isolated vocal or aligned guide. Dozi creates a
          private vocal-only source and opens Phrase Repair automatically.
        </p>
        <form className="repair-form" onSubmit={submit}>
          <label className="repair-file-picker">
            VOCAL FILE
            <input
              type="file"
              accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.wav,.flac,.mp3,.m4a,.ogg,.webm"
              required
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="repair-attestation">
            <input
              type="checkbox"
              checked={rightsAttested}
              onChange={(event) => setRightsAttested(event.target.checked)}
            />
            <span>
              <strong>I own or control this vocal recording</strong>
              <small>It will remain private within my Dozi account.</small>
            </span>
          </label>
          <button className="repair-primary" disabled={!file || !rightsAttested || busy}>
            {busy ? "Importing vocal…" : "Import and open Phrase Repair"}
          </button>
        </form>
        {error && (
          <p className="repair-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function PhraseRepairModal({
  song,
  initialTime,
  profiles,
  onClose,
}: {
  song: Song;
  initialTime: number;
  profiles: VocalProfile[];
  onClose: () => void;
}) {
  const verifiedProfiles = profiles.filter(
      (profile) => profile.verifiedAt && profile.status !== "REVOKED",
    ),
    safeStart = Math.max(0, Math.min(song.duration - 0.25, initialTime)),
    [startSeconds, setStartSeconds] = useState(Number(safeStart.toFixed(2))),
    [endSeconds, setEndSeconds] = useState(
      Number(Math.min(song.duration, safeStart + 4).toFixed(2)),
    ),
    [lyricText, setLyricText] = useState(""),
    [profileId, setProfileId] = useState(verifiedProfiles[0]?.id || ""),
    [crossfadeMs, setCrossfadeMs] = useState(80),
    [rightsAttested, setRightsAttested] = useState(false),
    [repair, setRepair] = useState<VocalRepair | null>(null),
    [previousRepairs, setPreviousRepairs] = useState<VocalRepair[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    selectedProfileId = profileId || verifiedProfiles[0]?.id || "";
  useEffect(() => {
    let current = true;
    fetch(`/api/vocal-repairs?generationId=${encodeURIComponent(song.id)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          repairs?: VocalRepair[];
          error?: { message: string };
        };
        if (!response.ok)
          throw new Error(data.error?.message || "Could not load phrase repairs.");
        if (current) setPreviousRepairs(data.repairs || []);
      })
      .catch((reason) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load phrase repairs.",
          );
      });
    return () => {
      current = false;
    };
  }, [song.id]);

  async function createRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedProfileId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vocal-repairs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            generationId: song.id,
            vocalProfileId: selectedProfileId,
            lyricText,
            startSeconds,
            endSeconds,
            crossfadeMs,
          }),
        }),
        data = (await response.json()) as {
          repair?: VocalRepair;
          error?: { message: string };
        };
      if (!response.ok || !data.repair)
        throw new Error(data.error?.message || "Could not create the repair.");
      setRepair(data.repair);
      setPreviousRepairs((items) => [data.repair as VocalRepair, ...items]);
      setMessage("Repair region saved. Add your clean punch-in take next.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create the repair.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadCandidate(file: File) {
    if (!repair || !rightsAttested || busy) return;
    setBusy(true);
    setError("");
    setMessage("Checking and securely uploading the punch-in…");
    try {
      const context = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(await file.arrayBuffer());
      } finally {
        void context.close();
      }
      const form = new FormData();
      form.set("audio", file);
      form.set("durationSeconds", String(decoded.duration));
      form.set("channelCount", String(decoded.numberOfChannels));
      form.set("sampleRate", String(decoded.sampleRate));
      form.set("rightsAttested", "true");
      form.set("label", file.name.replace(/\.[^.]+$/, "") || "Artist punch-in");
      const response = await fetch(
          `/api/vocal-repairs/${repair.id}/candidates`,
          { method: "POST", body: form },
        ),
        data = (await response.json()) as {
          candidate?: VocalRepairCandidate;
          error?: { message: string };
        };
      if (!response.ok || !data.candidate)
        throw new Error(data.error?.message || "Could not upload the punch-in.");
      setRepair((current) =>
        current
          ? {
              ...current,
              status: "READY",
              candidates: [data.candidate as VocalRepairCandidate, ...current.candidates],
            }
          : current,
      );
      setMessage("Punch-in ready. Listen, then choose Use this take.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not upload the punch-in.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadSourceVocal(file: File) {
    if (!repair || !rightsAttested || busy) return;
    setBusy(true);
    setError("");
    setMessage("Preparing the aligned source vocal…");
    try {
      const context = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(await file.arrayBuffer());
      } finally {
        void context.close();
      }
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1)
          mono[index] += samples[index] / decoded.numberOfChannels;
      }
      const wav = encodeMonoPcm16Wav(mono, decoded.sampleRate),
        form = new FormData();
      form.set(
        "audio",
        new File([wav], `${file.name.replace(/\.[^.]+$/, "") || "source-vocal"}.wav`, {
          type: "audio/wav",
        }),
      );
      form.set("durationSeconds", String(decoded.duration));
      form.set("channelCount", "1");
      form.set("sampleRate", String(decoded.sampleRate));
      form.set("rightsAttested", "true");
      const response = await fetch(`/api/vocal-repairs/${repair.id}/source`, {
          method: "POST",
          body: form,
        }),
        data = (await response.json()) as {
          source?: { audioAssetId: string; audioUrl: string };
          error?: { message: string };
        };
      if (!response.ok || !data.source)
        throw new Error(data.error?.message || "Could not save the source vocal stem.");
      setRepair((current) =>
        current
          ? {
              ...current,
              sourceVocalAssetId: data.source?.audioAssetId || null,
              sourceVocalAudioUrl: data.source?.audioUrl,
            }
          : current,
      );
      setMessage("Source vocal is aligned and ready for a non-destructive repair.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save the source vocal stem.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectCandidate(candidateId: string) {
    if (!repair || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/vocal-repairs/${repair.id}/select`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId }),
        }),
        data = (await response.json()) as {
          selection?: { candidateId: string };
          error?: { message: string };
        };
      if (!response.ok || !data.selection)
        throw new Error(data.error?.message || "Could not select the take.");
      setRepair((current) =>
        current
          ? {
              ...current,
              status: "SELECTED",
              candidates: current.candidates.map((candidate) => ({
                ...candidate,
                status:
                  candidate.id === candidateId
                    ? "SELECTED"
                    : candidate.status === "SELECTED"
                      ? "READY"
                      : candidate.status,
              })),
            }
          : current,
      );
      setMessage(
        "Take selected. Render it when the aligned source vocal is ready.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not select the take.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function renderRepair() {
    if (!repair || busy) return;
    setBusy(true);
    setError("");
    setMessage("Rendering the phrase crossfade…");
    try {
      const response = await fetch(`/api/vocal-repairs/${repair.id}/render`, {
          method: "POST",
        }),
        data = (await response.json()) as {
          render?: { audioAssetId: string; audioUrl: string; status: "APPLIED" };
          error?: { message: string };
        };
      if (!response.ok || !data.render)
        throw new Error(data.error?.message || "Could not render the phrase repair.");
      setRepair((current) =>
        current
          ? {
              ...current,
              status: data.render?.status || "APPLIED",
              renderedAudioAssetId: data.render?.audioAssetId || null,
              renderedAudioUrl: data.render?.audioUrl,
            }
          : current,
      );
      setMessage("Repair rendered. Audition the new vocal before using it in a mix.");
    } catch (reason) {
      setRepair((current) => (current ? { ...current, status: "FAILED" } : current));
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not render the phrase repair.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="repair-modal-backdrop" role="presentation">
      <section
        className="repair-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repair-modal-title"
      >
        <div className="repair-modal-head">
          <div>
            <small>VOCAL PHRASE REPAIR</small>
            <h2 id="repair-modal-title">Fix one line, keep the performance</h2>
          </div>
          <button aria-label="Close phrase repair" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="repair-source">
          <div>
            <strong>{song.title}</strong>
            <span>
              Version {song.version} · {song.duration.toFixed(0)} seconds
            </span>
          </div>
          <audio controls preload="metadata" src={song.audioUrl} />
        </div>
        {!repair ? (
          <form className="repair-form" onSubmit={createRepair}>
            <label className="repair-lyric">
              LYRIC TO REPAIR
              <input
                value={lyricText}
                onChange={(event) => setLyricText(event.target.value)}
                placeholder='For example: "my mix"'
                required
                maxLength={500}
              />
            </label>
            <div className="repair-range">
              <label>
                START
                <input
                  type="number"
                  min={0}
                  max={song.duration}
                  step="0.01"
                  value={startSeconds}
                  onChange={(event) => setStartSeconds(Number(event.target.value))}
                />
              </label>
              <label>
                END
                <input
                  type="number"
                  min={0.25}
                  max={song.duration}
                  step="0.01"
                  value={endSeconds}
                  onChange={(event) => setEndSeconds(Number(event.target.value))}
                />
              </label>
              <label>
                CROSSFADE
                <select
                  value={crossfadeMs}
                  onChange={(event) => setCrossfadeMs(Number(event.target.value))}
                >
                  <option value={40}>40 ms</option>
                  <option value={80}>80 ms</option>
                  <option value={120}>120 ms</option>
                </select>
              </label>
            </div>
            <label>
              ARTIST VOICE
              <select
                value={selectedProfileId}
                onChange={(event) => setProfileId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Choose a verified voice
                </option>
                {verifiedProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            {!verifiedProfiles.length && (
              <p className="repair-warning">
                Complete the identity phrase in My Voice before creating a repair.
              </p>
            )}
            <button
              className="repair-primary"
              disabled={
                busy ||
                !verifiedProfiles.length ||
                !lyricText.trim() ||
                endSeconds <= startSeconds ||
                endSeconds > song.duration
              }
            >
              {busy ? "Saving region…" : "Create repair region"}
            </button>
          </form>
        ) : (
          <div className="repair-takes">
            <div className="repair-region-summary">
              <div>
                <small>REGION</small>
                <strong>
                  {repair.startSeconds.toFixed(2)}–{repair.endSeconds.toFixed(2)}s
                </strong>
              </div>
              <blockquote>“{repair.lyricText}”</blockquote>
              <span>{repair.crossfadeMs} ms crossfade</span>
            </div>
            <label className="repair-attestation">
              <input
                type="checkbox"
                checked={rightsAttested}
                onChange={(event) => setRightsAttested(event.target.checked)}
              />
              <span>
                <strong>I own or control these vocal recordings</strong>
                <small>
                  The source stem and punch-in remain private and attached to this
                  repair.
                </small>
              </span>
            </label>
            {repair.sourceVocalAudioUrl ? (
              <div className="repair-source-vocal">
                <div>
                  <strong>Aligned original vocal</strong>
                  <span>Timeline-aligned source for the non-destructive crossfade</span>
                </div>
                <audio controls preload="none" src={repair.sourceVocalAudioUrl} />
              </div>
            ) : (
              <label
                className={`repair-upload ${busy || !rightsAttested ? "disabled" : ""}`}
              >
                {busy ? "Preparing source…" : "Import aligned original vocal stem"}
                <input
                  type="file"
                  accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.wav,.flac,.mp3,.m4a,.ogg,.webm"
                  disabled={busy || !rightsAttested}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadSourceVocal(file);
                  }}
                />
                <small>
                  Use an isolated vocal beginning at 0:00 that extends beyond this
                  phrase.
                </small>
              </label>
            )}
            <label className={`repair-upload ${busy || !rightsAttested ? "disabled" : ""}`}>
              {busy ? "Uploading…" : "Import owned punch-in"}
              <input
                type="file"
                accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.wav,.flac,.mp3,.m4a,.ogg,.webm"
                disabled={busy || !rightsAttested}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadCandidate(file);
                }}
              />
            </label>
            {repair.candidates.map((candidate) => (
              <article className="repair-candidate" key={candidate.id}>
                <div>
                  <strong>{candidate.label}</strong>
                  <span>
                    Owned artist punch-in · {candidate.status.toLowerCase()}
                  </span>
                </div>
                {candidate.audioUrl && (
                  <audio controls preload="none" src={candidate.audioUrl} />
                )}
                <button
                  disabled={busy || candidate.status === "SELECTED"}
                  onClick={() => void selectCandidate(candidate.id)}
                >
                  {candidate.status === "SELECTED" ? "Selected" : "Use this take"}
                </button>
              </article>
            ))}
            {repair.renderedAudioUrl ? (
              <div className="repair-rendered">
                <div>
                  <small>REPAIRED VOCAL</small>
                  <strong>Crossfade preview ready</strong>
                </div>
                <audio controls preload="metadata" src={repair.renderedAudioUrl} />
                <p>
                  This is a new vocal alternative. The original vocal and song master
                  remain unchanged.
                </p>
              </div>
            ) : (
              <button
                className="repair-primary"
                disabled={
                  busy ||
                  !repair.sourceVocalAssetId ||
                  !repair.candidates.some((candidate) => candidate.status === "SELECTED")
                }
                onClick={() => void renderRepair()}
              >
                {busy
                  ? "Rendering repair…"
                  : repair.status === "FAILED"
                    ? "Retry repair render"
                    : "Render repair preview"}
              </button>
            )}
          </div>
        )}
        {message && (
          <p className="repair-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="repair-error" role="alert">
            {error}
          </p>
        )}
        {!!previousRepairs.length && !repair && (
          <p className="repair-history">
            {previousRepairs.length} saved repair
            {previousRepairs.length === 1 ? "" : "s"} for this version.
          </p>
        )}
      </section>
    </div>
  );
}

function MultitrackWorkspace({
  data,
  onClose,
  onRefresh,
}: {
  data: SongWorkspace;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [versionId, setVersionId] = useState(data.versions[0]?.id || ""),
    [playing, setPlaying] = useState(false),
    [switchingVersionId, setSwitchingVersionId] = useState(""),
    [position, setPosition] = useState(0),
    [auditionMode, setAuditionMode] = useState<"tracks" | "master">(
      data.versions[0]?.audioUrl ? "master" : "tracks",
    ),
    [muted, setMuted] = useState<Record<string, boolean>>({}),
    [soloed, setSoloed] = useState<Record<string, boolean>>({}),
    [levels, setLevels] = useState<Record<string, number>>({}),
    [pans, setPans] = useState<Record<string, number>>({}),
    [separation, setSeparation] = useState<{
      jobId: string;
      status: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
      progress: number;
      message: string;
      errorCode?: string;
    } | null>(null),
    [separationError, setSeparationError] = useState("");
  const [mixBusy, setMixBusy] = useState<"" | "saving" | "rendering">(""),
    [mixNotice, setMixNotice] = useState(""),
    [mixError, setMixError] = useState(""),
    [replaceTrack, setReplaceTrack] = useState<TrackAsset | null>(null),
    [replaceFile, setReplaceFile] = useState<File | null>(null),
    [replaceRights, setReplaceRights] = useState(false),
    [replaceBusy, setReplaceBusy] = useState(false),
    [replaceError, setReplaceError] = useState("");
  const elements = useRef<Record<string, HTMLAudioElement | null>>({}),
    masterElements = useRef<Record<string, HTMLAudioElement | null>>({}),
    context = useRef<AudioContext | null>(null),
    nodes = useRef<
      Record<
        string,
        {
          source: MediaElementAudioSourceNode;
          gain: GainNode;
          panner: StereoPannerNode;
        }
      >
    >({}),
    frame = useRef<number | null>(null),
    positionRef = useRef(0),
    clockStart = useRef(0),
    started = useRef(new Set<string>()),
    versionSwitchToken = useRef(0),
    togglePlaybackRef = useRef<() => Promise<void>>(async () => undefined),
    returnToStartRef = useRef<() => Promise<void>>(async () => undefined);
  const version =
      data.versions.find((item) => item.id === versionId) || data.versions[0],
    tracks = useMemo(() => {
      if (!version) return [];
      const stems = version.assets.filter((asset) =>
        ["NATIVE_TRACK", "DERIVED_STEM", "EFFECT_RETURN"].includes(asset.role),
      );
      if (stems.length) return stems;
      const premaster = version.assets.find(
        (asset) => asset.role === "PREMASTER" && !asset.isPrimary,
      );
      const master = version.assets.find(
        (asset) => asset.isPrimary || asset.role === "MASTER",
      );
      return premaster ? [premaster] : master ? [master] : version.assets.slice(0, 1);
    }, [version]),
    hasStems = tracks.length > 1,
    hasGeneratedLeadVocal = tracks.some(
      (track) =>
        track.role === "NATIVE_TRACK" && track.instrument === "Lead Vocal",
    ),
    generatedLeadVocal = tracks.find(
      (track) =>
        track.role === "NATIVE_TRACK" && track.instrument === "Lead Vocal",
    ),
    sourceVocalStem = tracks.find(
      (track) =>
        track.role === "DERIVED_STEM" && track.instrumentGroup === "VOCALS",
    ),
    hasVocalComparison = Boolean(generatedLeadVocal && sourceVocalStem),
    anySolo = tracks.some(
      (track) => soloed[track.id] ?? Boolean(track.metadata?.soloed),
    ),
    preloadedMasterIds = new Set([
      version?.id,
      ...data.versions
        .filter((item) => item.audioUrl)
        .slice(0, 2)
        .map((item) => item.id),
    ]);
  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;
  function pauseElements(exceptMaster?: HTMLAudioElement) {
    Object.values(elements.current).forEach((element) => element?.pause());
    Object.values(masterElements.current).forEach((element) => {
      if (element && element !== exceptMaster) {
        element.pause();
        element.volume = 1;
      }
    });
  }
  function pauseTrackElements() {
    Object.values(elements.current).forEach((element) => element?.pause());
  }
  async function waitUntilPlayable(element: HTMLAudioElement) {
    if (element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => finish(() => reject(new Error("The comparison master took too long to load."))),
        10000,
      );
      const finish = (complete: () => void) => {
        window.clearTimeout(timeout);
        element.removeEventListener("canplay", ready);
        element.removeEventListener("error", failed);
        complete();
      };
      const ready = () => finish(resolve);
      const failed = () =>
        finish(() => reject(new Error("The comparison master could not be loaded.")));
      element.addEventListener("canplay", ready, { once: true });
      element.addEventListener("error", failed, { once: true });
      element.load();
    });
  }
  async function positionMediaElement(element: HTMLAudioElement, seconds: number) {
    await waitUntilPlayable(element);
    if (Math.abs(element.currentTime - seconds) < 0.015) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => finish(() => reject(new Error("Audio positioning took too long."))),
        5000,
      );
      const finish = (complete: () => void) => {
        window.clearTimeout(timeout);
        element.removeEventListener("seeked", positioned);
        element.removeEventListener("error", failed);
        complete();
      };
      const positioned = () => finish(resolve);
      const failed = () =>
        finish(() => reject(new Error("Audio could not be positioned.")));
      element.addEventListener("seeked", positioned, { once: true });
      element.addEventListener("error", failed, { once: true });
      element.currentTime = seconds;
    });
  }
  async function crossfadeMasters(
    previous: HTMLAudioElement | null,
    next: HTMLAudioElement,
  ) {
    next.volume = previous && !previous.paused ? 0 : 1;
    await next.play();
    if (!previous || previous === next || previous.paused) return;
    await new Promise<void>((resolve) => {
      const start = performance.now(),
        duration = 90;
      const fade = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        previous.volume = 1 - progress;
        next.volume = progress;
        if (progress < 1) requestAnimationFrame(fade);
        else resolve();
      };
      requestAnimationFrame(fade);
    });
    previous.volume = 0;
    next.volume = 1;
  }
  async function fadeElementVolume(
    element: HTMLAudioElement,
    from: number,
    to: number,
    duration = 55,
  ) {
    element.volume = from;
    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const fade = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        element.volume = from + (to - from) * progress;
        if (progress < 1) requestAnimationFrame(fade);
        else resolve();
      };
      requestAnimationFrame(fade);
    });
  }
  const isMuted = useCallback((track: TrackAsset) => {
    if (track.id in muted) return muted[track.id];
    if ("muted" in track.metadata) return Boolean(track.metadata.muted);
    return (
      hasGeneratedLeadVocal &&
      track.role === "DERIVED_STEM" &&
      track.instrumentGroup === "VOCALS"
    );
  }, [muted, hasGeneratedLeadVocal]);
  const isSoloed = useCallback(
    (track: TrackAsset) => soloed[track.id] ?? Boolean(track.metadata?.soloed),
    [soloed],
  );
  function chooseVocalComparison(choice: "generated" | "source") {
    if (!generatedLeadVocal || !sourceVocalStem) return;
    setMuted((values) => ({
      ...values,
      [generatedLeadVocal.id]: choice === "source",
      [sourceVocalStem.id]: choice === "generated",
    }));
  }
  const mixGain = useCallback((track: TrackAsset) => {
    if (isMuted(track) || (anySolo && !isSoloed(track))) return 0;
    return 10 ** ((levels[track.id] ?? track.gainDb ?? 0) / 20);
  }, [anySolo, isMuted, isSoloed, levels]);
  const playbackGain = useCallback(
    (track: TrackAsset) => (auditionMode === "master" ? 0 : mixGain(track)),
    [auditionMode, mixGain],
  );
  function setTrackGain(
    graph: { gain: GainNode; panner: StereoPannerNode },
    gain: number,
    smooth = false,
  ) {
    const audioContext = context.current;
    if (Math.abs(graph.gain.gain.value - gain) < 0.0001) return;
    if (!smooth || !audioContext) {
      graph.gain.gain.value = gain;
      return;
    }
    const now = audioContext.currentTime;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setValueAtTime(graph.gain.gain.value, now);
    graph.gain.gain.linearRampToValueAtTime(gain, now + 0.035);
  }
  function currentSettings() {
    return tracks.map((track) => ({
      trackId: track.id,
      gainDb: levels[track.id] ?? track.gainDb ?? 0,
      pan: pans[track.id] ?? track.pan ?? 0,
      muted: isMuted(track),
      soloed: isSoloed(track),
    }));
  }
  function applyMix() {
    for (const track of tracks) {
      const graph = nodes.current[track.id];
      if (!graph) continue;
      setTrackGain(graph, playbackGain(track));
      graph.panner.pan.value = pans[track.id] ?? track.pan ?? 0;
    }
  }
  async function ensureAudioGraph() {
    const audioContext = context.current || new AudioContext();
    context.current = audioContext;
    if (audioContext.state === "suspended") await audioContext.resume();
    for (const track of tracks) {
      const element = elements.current[track.id];
      if (!element || nodes.current[track.id]) continue;
      const source = audioContext.createMediaElementSource(element),
        gain = audioContext.createGain(),
        panner = audioContext.createStereoPanner();
      source.connect(gain).connect(panner).connect(audioContext.destination);
      nodes.current[track.id] = { source, gain, panner };
    }
    applyMix();
  }
  async function startTracksAt(playhead: number, startSilent = false) {
    await ensureAudioGraph();
    const active = tracks.flatMap((track) => {
      const element = elements.current[track.id],
        playableDuration = Math.max(
          0,
          (track.sourceEndSeconds ?? track.durationSeconds) -
            track.sourceStartSeconds,
        ),
        trackEnd = track.timelineStartSeconds + playableDuration;
      if (
        !element ||
        playhead < track.timelineStartSeconds ||
        playhead >= trackEnd
      )
        return [];
      return [
        {
          track,
          element,
          sourceTime:
            track.sourceStartSeconds + playhead - track.timelineStartSeconds,
        },
      ];
    });
    await Promise.all(
      active.map(({ element, sourceTime }) =>
        positionMediaElement(element, sourceTime),
      ),
    );
    if (startSilent)
      active.forEach(({ track }) => {
        const graph = nodes.current[track.id];
        if (graph) graph.gain.gain.value = 0;
      });
    started.current.clear();
    active.forEach(({ track }) => started.current.add(track.id));
    clockStart.current = performance.now() - playhead * 1000;
    await Promise.all(active.map(({ element }) => element.play()));
  }
  async function startMasterComparisonAt(playhead: number) {
    const active = masterElements.current[version.id];
    if (!active) return;
    const comparisons = data.versions
      .filter((item) => item.audioUrl && preloadedMasterIds.has(item.id))
      .flatMap((item) => {
        const element = masterElements.current[item.id];
        return element ? [{ id: item.id, element }] : [];
      });
    await Promise.all(
      comparisons.map(({ element }) => positionMediaElement(element, playhead)),
    );
    comparisons.forEach(({ id, element }) => {
      element.volume = id === version.id ? 1 : 0;
    });
    await Promise.all(comparisons.map(({ element }) => element.play()));
  }
  async function beginPlayback(mode: "tracks" | "master") {
    if (!version) return;
    if (positionRef.current >= version.duration - 0.01) {
      positionRef.current = 0;
      setPosition(0);
    }
    if (mode === "master") {
      await Promise.all([
        startMasterComparisonAt(positionRef.current),
        startTracksAt(positionRef.current, true),
      ]);
    } else {
      await startTracksAt(positionRef.current);
    }
    clockStart.current = performance.now() - positionRef.current * 1000;
    setPlaying(true);
  }
  async function togglePlayback() {
    if (playing) {
      setPlaying(false);
      pauseElements();
      return;
    }
    try {
      await beginPlayback(auditionMode);
    } catch {
      setMixError("The selected audio could not start playing.");
      setPlaying(false);
    }
  }
  useEffect(() => {
    togglePlaybackRef.current = togglePlayback;
    returnToStartRef.current = async () => seek(0);
  });
  useEffect(() => {
    const isTransportKey = (event: KeyboardEvent, code: "Space" | "Enter") =>
      event.code === code &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !document.querySelector('[role="dialog"][aria-modal="true"]');
    const consumeTransportKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (isTransportKey(event, "Space")) {
        consumeTransportKey(event);
        void togglePlaybackRef.current();
      } else if (isTransportKey(event, "Enter")) {
        consumeTransportKey(event);
        void returnToStartRef.current();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isTransportKey(event, "Space") || isTransportKey(event, "Enter"))
        consumeTransportKey(event);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);
  async function changeAuditionMode(next: "tracks" | "master") {
    if (next === auditionMode) return;
    if (!playing) {
      setAuditionMode(next);
      return;
    }
    try {
      const playhead =
          auditionMode === "master"
            ? masterElements.current[version.id]?.currentTime ?? positionRef.current
            : positionRef.current,
        master = masterElements.current[version.id];
      if (!master) throw new Error("The saved master is not ready for comparison.");
      let handoffPlayhead = playhead;
      if (next === "master") {
        await positionMediaElement(master, playhead);
        master.volume = 0;
        await master.play();
        for (const track of tracks) {
          const graph = nodes.current[track.id];
          if (graph) setTrackGain(graph, 0, true);
        }
        await fadeElementVolume(master, 0, 1);
        handoffPlayhead = master.currentTime;
      } else {
        const tracksAreAlreadyRunning = tracks.some((track) => {
          const element = elements.current[track.id];
          return Boolean(element && !element.paused);
        });
        if (!tracksAreAlreadyRunning) await startTracksAt(playhead, true);
        for (const track of tracks) {
          const graph = nodes.current[track.id];
          if (graph) setTrackGain(graph, mixGain(track), true);
        }
        await fadeElementVolume(master, master.volume, 0);
        master.pause();
        master.volume = 1;
        handoffPlayhead = Math.min(
          version.duration,
          (performance.now() - clockStart.current) / 1000,
        );
      }
      positionRef.current = handoffPlayhead;
      clockStart.current = performance.now() - handoffPlayhead * 1000;
      setPosition(handoffPlayhead);
      setAuditionMode(next);
      setMixError("");
    } catch (error) {
      setMixError(
        error instanceof Error ? error.message : "The selected audio could not start playing.",
      );
    }
  }
  async function startSeparation() {
    if (!version) return;
    setSeparationError("");
    const response = await fetch(
        `/api/songs/${data.song.id}/versions/${version.id}/separation`,
        { method: "POST" },
      ),
      payload = (await response.json()) as {
        job?: {
          jobId: string;
          status: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
          progress: number;
          message: string;
          errorCode?: string;
        };
        error?: { message: string };
      };
    if (!response.ok || !payload.job) {
      setSeparationError(payload.error?.message || "Stem separation could not start.");
      return;
    }
    setSeparation(payload.job);
    if (payload.job.status === "COMPLETE") await onRefresh();
  }
  async function saveMixSettings() {
    if (!version || !tracks.length) return;
    setMixBusy("saving");
    setMixError("");
    setMixNotice("");
    try {
      const response = await fetch(
          `/api/songs/${data.song.id}/versions/${version.id}/mix`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ settings: currentSettings() }),
          },
        ),
        payload = (await response.json()) as {
          saved?: boolean;
          error?: { message: string };
        };
      if (!response.ok || !payload.saved)
        throw new Error(payload.error?.message || "Mixer settings could not be saved.");
      setMixNotice("Mixer settings saved to this version.");
      await onRefresh();
    } catch (error) {
      setMixError(error instanceof Error ? error.message : "Mixer settings could not be saved.");
    } finally {
      setMixBusy("");
    }
  }
  async function renderMix() {
    if (!version || !tracks.length) return;
    setMixBusy("rendering");
    setMixError("");
    setMixNotice("Decoding private tracks…");
    setPlaying(false);
    pauseElements();
    try {
      const sampleRate = 48000,
        renderer = new OfflineAudioContext(
          2,
          Math.ceil(version.duration * sampleRate),
          sampleRate,
        );
      for (const track of tracks) {
        const response = await fetch(track.audioUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load ${track.instrument || track.role}.`);
        const decoded = await renderer.decodeAudioData(await response.arrayBuffer()),
          source = renderer.createBufferSource(),
          gain = renderer.createGain(),
          panner = renderer.createStereoPanner(),
          offset = Math.max(0, track.sourceStartSeconds),
          available = Math.max(
            0,
            Math.min(
              decoded.duration - offset,
              (track.sourceEndSeconds ?? decoded.duration) - offset,
              version.duration - track.timelineStartSeconds,
            ),
          );
        source.buffer = decoded;
        gain.gain.value = mixGain(track);
        panner.pan.value = pans[track.id] ?? track.pan ?? 0;
        source.connect(gain).connect(panner).connect(renderer.destination);
        if (available > 0) source.start(track.timelineStartSeconds, offset, available);
      }
      setMixNotice("Rendering the new stereo mix…");
      const rendered = await renderer.startRendering(),
        blob = encodeStereoPcm16Wav(rendered),
        form = new FormData();
      form.set("audio", new File([blob], `dozi-mix-v${version.version + 1}.wav`, { type: "audio/wav" }));
      form.set("settings", JSON.stringify(currentSettings()));
      setMixNotice("Saving the new version securely…");
      const response = await fetch(
          `/api/songs/${data.song.id}/versions/${version.id}/mix`,
          { method: "POST", body: form },
        ),
        responseText = await response.text();
      let payload: {
          version?: { id: string; version: number };
          error?: { message: string };
        } = {};
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        if (response.status === 413)
          throw new Error(
            "This mix is too large for the server upload limit. Restart Dozi to load the current upload configuration, then try again.",
          );
        throw new Error(
          response.ok
            ? "The server returned an unreadable response while saving the mix."
            : responseText.trim() || "The new mix could not be saved.",
        );
      }
      if (!response.ok || !payload.version)
        throw new Error(payload.error?.message || "The new mix could not be saved.");
      await onRefresh();
      selectVersion(payload.version.id, "master");
      setMixNotice(`Version ${payload.version.version} rendered and saved.`);
    } catch (error) {
      setMixError(error instanceof Error ? error.message : "The new mix could not be rendered.");
      setMixNotice("");
    } finally {
      setMixBusy("");
    }
  }
  async function submitTrackReplacement() {
    if (!version || !replaceTrack || !replaceFile || !replaceRights) return;
    setReplaceBusy(true);
    setReplaceError("");
    setMixError("");
    setMixNotice("Preparing the aligned replacement track…");
    setPlaying(false);
    pauseElements();
    try {
      const decoder = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await decoder.decodeAudioData(await replaceFile.arrayBuffer());
      } finally {
        await decoder.close();
      }
      if (Math.abs(decoded.duration - version.duration) > 0.2)
        throw new Error(
          `This file is ${formatTime(decoded.duration)}, but Version ${version.version} is ${formatTime(version.duration)}. Export a full-length aligned stem and try again.`,
        );
      const sampleRate = 48000,
        renderer = new OfflineAudioContext(
          2,
          Math.ceil(version.duration * sampleRate),
          sampleRate,
        ),
        source = renderer.createBufferSource();
      source.buffer = decoded;
      source.connect(renderer.destination);
      source.start(0);
      const rendered = await renderer.startRendering(),
        blob = encodeStereoPcm16Wav(rendered),
        form = new FormData();
      form.set(
        "audio",
        new File([blob], replaceFile.name.replace(/\.[^.]+$/, "") + ".wav", {
          type: "audio/wav",
        }),
      );
      form.set("rightsAttested", "true");
      setMixNotice("Saving the private replacement as a new draft version…");
      const response = await fetch(
          `/api/songs/${data.song.id}/versions/${version.id}/tracks/${replaceTrack.id}/replace`,
          { method: "POST", body: form },
        ),
        responseText = await response.text();
      let payload: {
        version?: { id: string; version: number };
        error?: { message: string };
      } = {};
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        if (response.status === 413)
          throw new Error("This replacement exceeds the server upload limit.");
        throw new Error(
          response.ok
            ? "The server returned an unreadable response while saving the replacement."
            : responseText.trim() || "The replacement could not be saved.",
        );
      }
      if (!response.ok || !payload.version)
        throw new Error(payload.error?.message || "The replacement could not be saved.");
      await onRefresh();
      selectVersion(payload.version.id, "tracks");
      setReplaceTrack(null);
      setReplaceFile(null);
      setReplaceRights(false);
      setMixNotice(
        `Version ${payload.version.version} is ready for live-track audition. Render it when the mix is approved.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The replacement could not be saved.";
      setReplaceError(message);
      setMixNotice("");
    } finally {
      setReplaceBusy(false);
    }
  }
  async function seek(next: number) {
    const bounded = Math.max(0, Math.min(version?.duration || 0, next));
    const resume = playing;
    if (resume) setPlaying(false);
    pauseElements();
    started.current.clear();
    positionRef.current = bounded;
    setPosition(bounded);
    if (!resume) return;
    try {
      await beginPlayback(auditionMode);
    } catch {
      setMixError("The tracks could not resume together at that position.");
      setPlaying(false);
    }
  }
  async function selectVersion(
    nextVersionId: string,
    nextMode?: "tracks" | "master",
  ) {
    const nextVersion = data.versions.find((item) => item.id === nextVersionId);
    if (!nextVersion || nextVersion.id === version.id) return;
    const switchToken = versionSwitchToken.current + 1;
    versionSwitchToken.current = switchToken;
    setSwitchingVersionId(nextVersionId);
    const resume = playing,
      targetMode =
        nextMode || (nextVersion.audioUrl ? "master" : "tracks"),
      currentMaster = masterElements.current[version.id],
      nextMaster = masterElements.current[nextVersion.id];
    let switchPosition =
      auditionMode === "master" && currentMaster
        ? currentMaster.currentTime
        : positionRef.current;

    if (resume && targetMode === "master" && nextMaster) {
      try {
        await waitUntilPlayable(nextMaster);
        if (switchToken !== versionSwitchToken.current) return;
        switchPosition =
          auditionMode === "master" && currentMaster
            ? currentMaster.currentTime
            : (performance.now() - clockStart.current) / 1000;
        const bounded = Math.max(0, Math.min(nextVersion.duration, switchPosition));
        const alreadyRunningInSync =
          auditionMode === "master" &&
          currentMaster &&
          !currentMaster.paused &&
          !nextMaster.paused &&
          Math.abs(nextMaster.currentTime - currentMaster.currentTime) < 0.05;
        if (!alreadyRunningInSync) {
          await positionMediaElement(nextMaster, bounded);
          nextMaster.volume = 0;
          await nextMaster.play();
        }
        if (switchToken !== versionSwitchToken.current) return;
        if (auditionMode !== "master") pauseTrackElements();
        await crossfadeMasters(
          auditionMode === "master" ? currentMaster : null,
          nextMaster,
        );
        const handoffPosition = nextMaster.currentTime;
        positionRef.current = handoffPosition;
        setPosition(handoffPosition);
        clockStart.current = performance.now() - handoffPosition * 1000;
        setMixError("");
        setPlaying(true);
      } catch (error) {
        setMixError(
          error instanceof Error
            ? error.message
            : "The comparison master could not start playing.",
        );
        setSwitchingVersionId("");
        return;
      }
    } else {
      pauseElements();
      const bounded = Math.max(0, Math.min(nextVersion.duration, switchPosition));
      positionRef.current = bounded;
      setPosition(bounded);
      if (resume) {
        setPlaying(false);
        setMixError(
          "This draft has no saved master for continuous A/B playback. Its playhead position was preserved.",
        );
      }
    }
    started.current.clear();
    setMuted({});
    setSoloed({});
    setLevels({});
    setPans({});
    setAuditionMode(targetMode);
    setVersionId(nextVersionId);
    setSwitchingVersionId("");
  }
  useEffect(() => {
    for (const track of tracks) {
      const graph = nodes.current[track.id];
      if (!graph) continue;
      setTrackGain(graph, playbackGain(track), true);
      graph.panner.pan.value = pans[track.id] ?? track.pan ?? 0;
    }
  }, [pans, playbackGain, tracks]);
  useEffect(() => {
    if (!playing || !version) return;
    const tick = () => {
      if (auditionMode === "master") {
        const element = masterElements.current[version.id];
        if (!element || element.ended) {
          positionRef.current = version.duration;
          setPosition(version.duration);
          setPlaying(false);
          return;
        }
        positionRef.current = element.currentTime;
        setPosition(element.currentTime);
        for (const comparison of Object.values(masterElements.current)) {
          if (
            comparison &&
            comparison !== element &&
            !comparison.paused &&
            Math.abs(comparison.currentTime - element.currentTime) > 0.05
          )
            comparison.currentTime = element.currentTime;
        }
        for (const track of tracks) {
          const trackElement = elements.current[track.id],
            playableDuration = Math.max(
              0,
              (track.sourceEndSeconds ?? track.durationSeconds) -
                track.sourceStartSeconds,
            ),
            trackEnd = track.timelineStartSeconds + playableDuration;
          if (
            !trackElement ||
            trackElement.paused ||
            element.currentTime < track.timelineStartSeconds ||
            element.currentTime >= trackEnd
          )
            continue;
          const expectedTime =
            track.sourceStartSeconds + element.currentTime - track.timelineStartSeconds;
          if (Math.abs(trackElement.currentTime - expectedTime) > 0.04)
            trackElement.currentTime = expectedTime;
        }
        frame.current = requestAnimationFrame(tick);
        return;
      }
      const current = (performance.now() - clockStart.current) / 1000;
      if (current >= version.duration) {
        positionRef.current = version.duration;
        setPosition(version.duration);
        setPlaying(false);
        pauseElements();
        return;
      }
      positionRef.current = current;
      setPosition(current);
      for (const track of tracks) {
        const element = elements.current[track.id],
          playableDuration = Math.max(
            0,
            (track.sourceEndSeconds ?? track.durationSeconds) -
              track.sourceStartSeconds,
          ),
          trackEnd = track.timelineStartSeconds + playableDuration,
          shouldRun =
            current >= track.timelineStartSeconds && current < trackEnd;
        if (!element) continue;
        if (shouldRun) {
          const sourceTime =
            track.sourceStartSeconds + current - track.timelineStartSeconds;
          if (!started.current.has(track.id)) {
            element.currentTime = sourceTime;
            started.current.add(track.id);
            void element.play().catch(() => setPlaying(false));
          } else if (Math.abs(element.currentTime - sourceTime) > 0.05) {
            element.currentTime = sourceTime;
          }
        } else if (started.current.has(track.id)) {
          element.pause();
          started.current.delete(track.id);
        }
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [playing, tracks, version, auditionMode]);
  useEffect(() => {
    if (!separation || !["QUEUED", "PROCESSING"].includes(separation.status)) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(
            `/api/songs/${data.song.id}/versions/${version.id}/separation?jobId=${encodeURIComponent(separation.jobId)}`,
            { cache: "no-store" },
          ),
          payload = (await response.json()) as {
            job?: typeof separation;
            error?: { message: string };
          };
        if (!response.ok || !payload.job)
          throw new Error(payload.error?.message || "Could not check separation progress.");
        setSeparation(payload.job);
        if (payload.job.status === "COMPLETE") await onRefresh();
        if (payload.job.status === "FAILED")
          setSeparationError("Stem separation did not finish. You can safely retry.");
      } catch (error) {
        setSeparationError(
          error instanceof Error ? error.message : "Could not check separation progress.",
        );
        setSeparation((current) =>
          current ? { ...current, status: "FAILED", progress: 0 } : current,
        );
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [separation, data.song.id, version.id, onRefresh]);
  useEffect(
    () => () => {
      pauseElements();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (context.current) void context.current.close();
    },
    [],
  );
  if (!version)
    return (
      <div className="empty tracks-error">
        <h3>No completed versions yet</h3>
        <p>This song will become editable after generation finishes.</p>
        <button onClick={onClose}>Back to library</button>
      </div>
    );
  return (
    <div className="mixer">
      <div className="mixer-head">
        <button className="mixer-back" onClick={onClose}>
          ← Library
        </button>
        <div>
          <small>SONG WORKSPACE</small>
          <h2>{data.song.title}</h2>
          <p>
            {version.bpm} BPM · {version.musicalKey} {version.scale} · {version.provider}
          </p>
        </div>
        <label>
          VERSION
          <select
            value={switchingVersionId || version.id}
            disabled={Boolean(switchingVersionId)}
            aria-busy={Boolean(switchingVersionId)}
            onChange={(event) => void selectVersion(event.target.value)}
          >
            {data.versions.map((item) => (
              <option key={item.id} value={item.id}>
                Version {item.version}
              </option>
            ))}
          </select>
          {switchingVersionId && (
            <small role="status">Switching at the current playhead…</small>
          )}
        </label>
      </div>
      <div className="mixer-transport">
        {data.versions.map((item) =>
          item.audioUrl ? (
            <audio
              key={item.id}
              ref={(element) => {
                masterElements.current[item.id] = element;
              }}
              src={item.audioUrl}
              preload={preloadedMasterIds.has(item.id) ? "auto" : "metadata"}
              onEnded={() => {
                if (item.id !== version.id) return;
                positionRef.current = item.duration;
                setPosition(item.duration);
                setPlaying(false);
              }}
            />
          ) : null,
        )}
        <button
          className="mixer-play"
          aria-label={playing ? "Pause all tracks" : "Play all tracks"}
          aria-keyshortcuts="Space Enter"
          onClick={() => void togglePlayback()}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <span>{formatTime(position)}</span>
        <input
          aria-label="Song position"
          type="range"
          min="0"
          max={version.duration}
          step="0.01"
          value={position}
          onChange={(event) => void seek(Number(event.target.value))}
        />
        <span>{formatTime(version.duration)}</span>
        <small className="mixer-shortcut"><kbd>Space</kbd> Play / pause · <kbd>Return</kbd> Go to start</small>
      </div>
      {hasStems && version.audioUrl && (
        <div className="audition-mode" role="group" aria-label="Audition source">
          <span>HEARING</span>
          <button
            className={auditionMode === "tracks" ? "active" : ""}
            aria-pressed={auditionMode === "tracks"}
            onClick={() => void changeAuditionMode("tracks")}
          >
            Live tracks
          </button>
          <button
            className={auditionMode === "master" ? "active" : ""}
            aria-pressed={auditionMode === "master"}
            onClick={() => void changeAuditionMode("master")}
          >
            Rendered master
          </button>
          <small>
            {auditionMode === "master"
              ? "Playing the saved Version master · switch to Live tracks to mute, solo, or adjust stems"
              : "Playing the editable stem reconstruction"}
          </small>
        </div>
      )}
      {hasVocalComparison && auditionMode === "tracks" && (
        <div className="audition-mode" role="group" aria-label="Vocal comparison">
          <span>VOCAL A/B</span>
          <button
            className={!isMuted(generatedLeadVocal!) && isMuted(sourceVocalStem!) ? "active" : ""}
            aria-pressed={!isMuted(generatedLeadVocal!) && isMuted(sourceVocalStem!)}
            onClick={() => chooseVocalComparison("generated")}
          >
            Generated Lead
          </button>
          <button
            className={isMuted(generatedLeadVocal!) && !isMuted(sourceVocalStem!) ? "active" : ""}
            aria-pressed={isMuted(generatedLeadVocal!) && !isMuted(sourceVocalStem!)}
            onClick={() => chooseVocalComparison("source")}
          >
            Source Vocal
          </button>
          <small>Switches only the two vocal tracks; the rest of the live mix continues playing.</small>
        </div>
      )}
      {hasStems && !version.audioUrl && (
        <div className="draft-version-note" role="status">
          <div>
            <strong>Editable track draft</strong>
            <span>
              This version has no finished master yet. You are hearing the live tracks; render a new mix when the replacement is approved.
            </span>
          </div>
        </div>
      )}
      {!hasStems && (
        <div className="master-only-note">
          <div>
            <strong>Finished master only</strong>
            <span>
              Create derived stems for editing. Separation can contain leakage or artifacts, so Dozi does not describe these as pristine studio tracks.
            </span>
          </div>
          <button
            disabled={!!separation && ["QUEUED", "PROCESSING"].includes(separation.status)}
            onClick={() => void startSeparation()}
          >
            {separation && ["QUEUED", "PROCESSING"].includes(separation.status)
              ? "Separating…"
              : separation?.status === "FAILED"
                ? "Retry separation"
                : "Separate into tracks"}
          </button>
        </div>
      )}
      {separation && ["QUEUED", "PROCESSING"].includes(separation.status) && (
        <div className="separation-progress" role="status">
          <progress max="100" value={separation.progress} />
          <span>{separation.message} · {separation.progress}%</span>
        </div>
      )}
      {separationError && <p className="separation-error" role="alert">{separationError}</p>}
      {hasGeneratedLeadVocal && hasStems && (
        <div className="draft-version-note" role="status">
          <div>
            <strong>Generated lead vocal active</strong>
            <span>
              The Source Vocal Stem is muted by default so it does not double the generated Lead Vocal. You can unmute it at any time to compare them.
            </span>
          </div>
        </div>
      )}
      <div className="track-list">
        {tracks.map((track, index) => {
          const isSourceVocal =
              hasGeneratedLeadVocal &&
              track.role === "DERIVED_STEM" &&
              track.instrumentGroup === "VOCALS",
            name =
            (isSourceVocal ? "Source Vocal Stem" : track.instrument) ||
            (track.role === "MASTER"
              ? "Master"
              : track.role.toLowerCase().replaceAll("_", " "));
          return (
            <article className="track-row" key={track.id} data-tone={index % 5}>
              <audio
                ref={(element) => {
                  elements.current[track.id] = element;
                }}
                src={track.audioUrl}
                preload="metadata"
              />
              <i className="track-color" />
              <div className="track-buttons">
                <button
                  className={isMuted(track) ? "active" : ""}
                  aria-label={`Mute ${name}`}
                  disabled={auditionMode === "master"}
                  title={
                    auditionMode === "master"
                      ? "Mute and solo are available in Live tracks."
                      : undefined
                  }
                  onClick={() =>
                    setMuted((values) => ({
                      ...values,
                      [track.id]: !isMuted(track),
                    }))
                  }
                >
                  M
                </button>
                <button
                  className={isSoloed(track) ? "active" : ""}
                  aria-label={`Solo ${name}`}
                  disabled={auditionMode === "master"}
                  title={
                    auditionMode === "master"
                      ? "Mute and solo are available in Live tracks."
                      : undefined
                  }
                  onClick={() =>
                    setSoloed((values) => ({
                      ...values,
                      [track.id]: !(values[track.id] ?? Boolean(track.metadata?.soloed)),
                    }))
                  }
                >
                  S
                </button>
              </div>
              <div className="track-name">
                <strong>{name}</strong>
                <small>{track.role.toLowerCase().replaceAll("_", " ")}</small>
                <a href={track.audioUrl} download={`${data.song.title}-${name}.wav`}>
                  Export stem
                </a>
                {hasStems && ["NATIVE_TRACK", "DERIVED_STEM"].includes(track.role) && (
                  <button
                    className="replace-track"
                    onClick={() => {
                      setReplaceTrack(track);
                      setReplaceFile(null);
                      setReplaceRights(false);
                      setReplaceError("");
                    }}
                  >
                    Replace track
                  </button>
                )}
              </div>
              <Wave
                compact
                data={track.waveform || []}
                progress={position / version.duration}
                onSeek={(fraction) => void seek(fraction * version.duration)}
              />
              <label className="track-control">
                LEVEL
                    <input
                      aria-label={`${name} level`}
                      type="range"
                      disabled={auditionMode === "master"}
                      title={
                        auditionMode === "master"
                          ? "Level is available in Live tracks."
                          : undefined
                      }
                      min="-60"
                  max="6"
                  step="0.5"
                  value={levels[track.id] ?? track.gainDb ?? 0}
                  onChange={(event) =>
                    setLevels((values) => ({
                      ...values,
                      [track.id]: Number(event.target.value),
                    }))
                  }
                />
                <span>{(levels[track.id] ?? track.gainDb ?? 0).toFixed(1)} dB</span>
              </label>
              <label className="track-control pan-control">
                PAN
                    <input
                      aria-label={`${name} pan`}
                      type="range"
                      disabled={auditionMode === "master"}
                      title={
                        auditionMode === "master"
                          ? "Pan is available in Live tracks."
                          : undefined
                      }
                      min="-1"
                  max="1"
                  step="0.05"
                  value={pans[track.id] ?? track.pan ?? 0}
                  onChange={(event) =>
                    setPans((values) => ({
                      ...values,
                      [track.id]: Number(event.target.value),
                    }))
                  }
                />
                <span>
                  {(pans[track.id] ?? track.pan ?? 0) === 0
                    ? "C"
                    : (pans[track.id] ?? track.pan ?? 0) < 0
                      ? `L${Math.round(Math.abs(pans[track.id] ?? track.pan ?? 0) * 100)}`
                      : `R${Math.round((pans[track.id] ?? track.pan ?? 0) * 100)}`}
                </span>
              </label>
            </article>
          );
        })}
      </div>
      {hasStems && (
        <div className="mixer-actions">
          <button disabled={!!mixBusy} onClick={() => void saveMixSettings()}>
            {mixBusy === "saving" ? "Saving…" : "Save mixer settings"}
          </button>
          <button
            className="render-mix"
            disabled={!!mixBusy}
            onClick={() => void renderMix()}
          >
            {mixBusy === "rendering" ? "Rendering…" : "Render new mix version"}
          </button>
          {version.audioUrl && (
            <a href={version.audioUrl} download={`${data.song.title}-v${version.version}.wav`}>
              Download current mix
            </a>
          )}
        </div>
      )}
      {mixNotice && <p className="mix-notice" role="status">{mixNotice}</p>}
      {mixError && <p className="mix-error" role="alert">{mixError}</p>}
      {replaceTrack && (
        <div className="repair-modal-backdrop" role="presentation">
          <section
            className="repair-modal repair-import-modal track-replace-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-replace-heading"
          >
            <div className="repair-modal-head">
              <div>
                <small>NON-DESTRUCTIVE TRACK EDIT</small>
                <h2 id="track-replace-heading">
                  Replace {replaceTrack.instrument || replaceTrack.role.toLowerCase().replaceAll("_", " ")}
                </h2>
              </div>
              <button
                aria-label="Close track replacement"
                disabled={replaceBusy}
                onClick={() => setReplaceTrack(null)}
              >
                ×
              </button>
            </div>
            <p className="repair-import-help">
              Choose a vocal or instrumental stem exported from the same song timeline. It must begin at 0:00 and match Version {version.version}&apos;s full {formatTime(version.duration)} duration. Dozi will make a private draft version and leave this version unchanged.
            </p>
            <label className="repair-file-picker">
              ALIGNED REPLACEMENT FILE
              <input
                type="file"
                accept="audio/*,.wav,.flac,.mp3,.m4a,.aiff,.aif"
                disabled={replaceBusy}
                onChange={(event) => {
                  setReplaceFile(event.target.files?.[0] || null);
                  setReplaceError("");
                }}
              />
            </label>
            {replaceFile && (
              <p className="track-replace-file">Selected: {replaceFile.name}</p>
            )}
            <label className="track-replace-rights">
              <input
                type="checkbox"
                checked={replaceRights}
                disabled={replaceBusy}
                onChange={(event) => setReplaceRights(event.target.checked)}
              />
              <span>
                <strong>I own or control this recording</strong>
                It will remain private within my Dozi account.
              </span>
            </label>
            {replaceError && <p className="mix-error" role="alert">{replaceError}</p>}
            <button
              className="track-replace-submit"
              disabled={!replaceFile || !replaceRights || replaceBusy}
              onClick={() => void submitTrackReplacement()}
            >
              {replaceBusy ? "Preparing and saving…" : "Create replacement draft"}
            </button>
          </section>
        </div>
      )}
      <p className="mixer-footnote">
        Mixer moves are non-destructive. Saving or rendering a new version leaves the source assets unchanged.
      </p>
    </div>
  );
}

function SongCard({
  song: s,
  tone,
  active,
  playing,
  time,
  onPlay,
  onOpen,
  onRepair,
  onSeek,
}: {
  song: Song;
  tone: number;
  active: Song | null;
  playing: boolean;
  time: number;
  onPlay: (s: Song) => void;
  onOpen: (s: Song) => void;
  onRepair: (s: Song) => void;
  onSeek: (p: number) => void;
}) {
  const fmt = (n: number) =>
      `${Math.floor(n / 60)}:${Math.floor(n % 60)
        .toString()
        .padStart(2, "0")}`,
    extension = s.vocalist ? "wav" : s.provider === "elevenlabs" ? "mp3" : "wav";
  return (
    <article className="song-card">
      <div className="cover" data-tone={tone}>
        <span>{s.status === "COMPLETE" ? "DZ" : s.progress + "%"}</span>
      </div>
      <div className="song-body">
        <div className="song-title">
          <div>
            <h3>{s.title}</h3>
            <p>
              {s.genre} · {s.bpm} BPM · {s.musicalKey}
            </p>
            {s.vocalist && <p className="song-vocalist">{s.vocalist}</p>}
          </div>
          <div className="song-actions">
            {s.audioUrl && (
              <a
                href={s.audioUrl}
                download={`${s.title}.${extension}`}
                aria-label={`Download ${extension.toUpperCase()}`}
              >
                <Icon name="download" />
              </a>
            )}
          </div>
        </div>
        {s.status === "COMPLETE" ? (
          <Wave
            data={s.waveform}
            progress={active?.id === s.id ? time / s.duration : 0}
            onSeek={onSeek}
            ariaLabel={`Play ${s.title} from this point`}
          />
        ) : (
          <div className="job-progress">
            <div>
              <i style={{ width: `${s.progress}%` }} />
            </div>
            <span>
              {s.status === "FAILED" && s.errorMessage
                ? s.errorMessage
                : labels[s.status]}
            </span>
          </div>
        )}
        <div className="song-foot">
          <button
            className="play"
            disabled={s.status !== "COMPLETE" || !s.audioUrl}
            onClick={() => onPlay(s)}
            aria-label={
              active?.id === s.id && playing ? `Pause ${s.title}` : `Play ${s.title}`
            }
          >
            <Icon name={active?.id === s.id && playing ? "pause" : "play"} />
          </button>
          <span>V{s.version}</span>
          <span>{fmt(s.duration)}</span>
          <span>Seed {s.seed}</span>
          <button
            className="remix open-tracks"
            disabled={s.status !== "COMPLETE"}
            onClick={() => onOpen(s)}
          >
            Open tracks
          </button>
          <button
            className="remix"
            disabled={s.status !== "COMPLETE" || !s.audioUrl}
            onClick={() => onRepair(s)}
          >
            Repair vocal
          </button>
        </div>
      </div>
    </article>
  );
}
