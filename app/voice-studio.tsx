"use client";

/* eslint-disable jsx-a11y/media-has-caption -- Generated music and isolated vocals have no spoken-dialogue caption track. */

import { FormEvent, useCallback, useEffect, useState } from "react";

type Project = {
  id: string;
  title: string;
  description: string;
  isPersonal: boolean;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VOCALIST" | "VIEWER";
  songCount: number;
};
type Voice = {
  id: string;
  displayName: string;
  status: string;
  authorizationStatus: "VERIFIED" | "INCOMPLETE";
  usageStatus: "AVAILABLE" | "ENROLLMENT_REQUIRED";
  permissionScope: "PRIVATE_OWNER";
  activeVersionNumber: number | null;
  provider: string | null;
  providerModel: string | null;
  artifactCount: number;
  managedModel: boolean;
};
type Conversion = {
  id: string;
  projectId: string;
  profileId: string;
  profileName?: string;
  profileVersion: number | null;
  mode: "PREVIEW" | "FULL";
  voiceIdentityStrength: number;
  status: "QUEUED" | "PREPARING" | "GENERATING" | "UPLOADING" | "COMPLETE" | "FAILED" | "CANCELLED";
  progress: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  sourceAudioUrl?: string;
  masterAudioUrl?: string;
  vocalAudioUrl?: string;
  createdAt: string;
};
type VoiceEngine = {
  provider: string;
  model: string;
  capabilities: {
    singingVoiceConversion: boolean;
    preview: boolean;
    training: string;
    returnsIsolatedVocal: boolean;
  };
  health: { available: boolean; message: string };
};

const lanes = [
  { name: "Lead Vocal", role: "LEAD" },
  { name: "Background Vocals", role: "BGV" },
  { name: "Harmony", role: "HARMONY" },
];
const terminal = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

export function VoiceStudio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [engine, setEngine] = useState<VoiceEngine | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [rightsAttested, setRightsAttested] = useState(false);
  const [voiceStrength, setVoiceStrength] = useState(100);
  const [activeConversion, setActiveConversion] = useState<Conversion | null>(null);
  const [busy, setBusy] = useState(true);
  const [conversionBusy, setConversionBusy] = useState(false);
  const [error, setError] = useState("");

  const loadFoundation = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [projectsResponse, voicesResponse, engineResponse, conversionsResponse] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/voice-library", { cache: "no-store" }),
        fetch("/api/voice-engine/capabilities", { cache: "no-store" }),
        fetch("/api/voice-conversions", { cache: "no-store" }),
      ]);
      if (![projectsResponse, voicesResponse, engineResponse, conversionsResponse].every((response) => response.ok))
        throw new Error("Voice Studio could not load its private workspace.");
      const projectData = (await projectsResponse.json()) as { projects: Project[] },
        voiceData = (await voicesResponse.json()) as { voices: Voice[] },
        engineData = (await engineResponse.json()) as VoiceEngine,
        conversionData = (await conversionsResponse.json()) as { conversions: Conversion[] };
      setProjects(projectData.projects);
      setVoices(voiceData.voices);
      setEngine(engineData);
      setConversions(conversionData.conversions);
      setSelectedProjectId((current) => {
        const saved = window.localStorage.getItem("dozi:voice-studio:project");
        return projectData.projects.some((project) => project.id === current)
          ? current
          : projectData.projects.some((project) => project.id === saved)
            ? saved || ""
            : projectData.projects[0]?.id || "";
      });
      setSelectedVoiceId((current) =>
        voiceData.voices.some((voice) => voice.id === current && voice.usageStatus === "AVAILABLE")
          ? current
          : voiceData.voices.find((voice) => voice.usageStatus === "AVAILABLE")?.id || "",
      );
      setActiveConversion((current) =>
        current
          ? conversionData.conversions.find((item) => item.id === current.id) || current
          : conversionData.conversions[0] || null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice Studio could not load.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFoundation(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFoundation]);
  useEffect(() => {
    if (selectedProjectId)
      window.localStorage.setItem("dozi:voice-studio:project", selectedProjectId);
  }, [selectedProjectId]);
  useEffect(() => {
    if (!activeConversion || terminal.has(activeConversion.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/voice-conversions/${activeConversion.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { conversion: Conversion };
        setActiveConversion(data.conversion);
        setConversions((current) => [data.conversion, ...current.filter((item) => item.id !== data.conversion.id)]);
      } catch {
        // The next poll can recover from a transient local connection failure.
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [activeConversion]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const title = projectTitle.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = (await response.json()) as { project?: Project; error?: { message?: string } };
      if (!response.ok || !data.project)
        throw new Error(data.error?.message || "The project could not be created.");
      setProjects((current) => [data.project!, ...current]);
      setSelectedProjectId(data.project.id);
      setProjectTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function startConversion(mode: "PREVIEW" | "FULL") {
    if (!sourceFile || !selectedVoiceId || !selectedProjectId || !rightsAttested) return;
    setConversionBusy(true);
    setError("");
    try {
      const metadata = await readAudioMetadata(sourceFile),
        form = new FormData();
      form.set("audio", sourceFile);
      form.set("profileId", selectedVoiceId);
      form.set("projectId", selectedProjectId);
      form.set("mode", mode);
      form.set("rightsAttested", "true");
      form.set("durationSeconds", String(metadata.duration));
      form.set("sampleRate", String(metadata.sampleRate));
      form.set("channels", String(metadata.channels));
      form.set("voiceIdentityStrength", String(voiceStrength));
      const response = await fetch("/api/voice-conversions", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: form,
      }),
        data = (await response.json()) as { conversion?: Conversion; error?: { message?: string } };
      if (!response.ok || !data.conversion)
        throw new Error(data.error?.message || "The voice conversion could not start.");
      setActiveConversion(data.conversion);
      setConversions((current) => [data.conversion!, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The voice conversion could not start.");
    } finally {
      setConversionBusy(false);
    }
  }

  async function cancelConversion() {
    if (!activeConversion || terminal.has(activeConversion.status)) return;
    setConversionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${activeConversion.id}`, { method: "DELETE" }),
        data = (await response.json()) as { cancelled?: boolean; error?: { message?: string } };
      if (!response.ok || !data.cancelled)
        throw new Error(data.error?.message || "The conversion could not be cancelled.");
      setActiveConversion((current) => current ? { ...current, status: "CANCELLED" } : current);
      setConversions((current) => current.map((item) => item.id === activeConversion.id ? { ...item, status: "CANCELLED" } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The conversion could not be cancelled.");
    } finally {
      setConversionBusy(false);
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId),
    selectedVoice = voices.find((voice) => voice.id === selectedVoiceId),
    canConvert = Boolean(
      sourceFile && selectedVoice && selectedProject && rightsAttested &&
      selectedVoice.usageStatus === "AVAILABLE" && engine?.health.available && !conversionBusy,
    );

  return (
    <section className="voice-studio" aria-label="Voice Studio">
      <header className="voice-studio-heading">
        <div><p>VOICE ARRANGEMENT WORKSPACE</p><h2>{selectedProject?.title || "Voice Studio"}</h2></div>
        <div className="voice-engine-status" role="status"><i className={engine?.health.available ? "ready" : ""} /><span>{engine?.provider || "RVC"}</span><small>{engine?.health.message || "Checking voice engine…"}</small></div>
        <div className="voice-studio-project">
          <label htmlFor="voice-studio-project">PROJECT</label>
          <select id="voice-studio-project" value={selectedProjectId} disabled={busy || projects.length === 0} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.role.toLowerCase()}</option>)}
          </select>
        </div>
      </header>
      {error && <p className="voice-studio-error" role="alert">{error}</p>}
      <div className="voice-studio-grid">
        <aside className="voice-studio-library">
          <div className="panel-title"><span>Audio & voice library</span><small>{voices.length} private voices</small></div>
          <form onSubmit={createProject} className="voice-project-create"><input aria-label="New Voice Studio project name" value={projectTitle} maxLength={120} onChange={(event) => setProjectTitle(event.target.value)} placeholder="New project name" /><button disabled={busy || !projectTitle.trim()}>Create</button></form>
          <div className="voice-library-list">
            {voices.map((voice) => (
              <button key={voice.id} type="button" className={selectedVoiceId === voice.id ? "selected" : ""} disabled={voice.usageStatus !== "AVAILABLE"} onClick={() => setSelectedVoiceId(voice.id)}>
                <i aria-hidden="true">V</i><span><strong>{voice.displayName}</strong><small>{voice.usageStatus === "AVAILABLE" ? `${voice.provider} · Model V${voice.activeVersionNumber}` : "Enrollment required"}</small></span><em className={voice.authorizationStatus.toLowerCase()}>{voice.managedModel ? "Managed" : voice.authorizationStatus === "VERIFIED" ? "Verified" : "Private"}</em>
              </button>
            ))}
            {!busy && voices.length === 0 && <p>No authorized voices yet. Use My Voice to begin enrollment.</p>}
          </div>
          {conversions.length > 0 && <div className="voice-conversion-history"><strong>Recent conversions</strong>{conversions.slice(0, 5).map((conversion) => <button type="button" key={conversion.id} onClick={() => setActiveConversion(conversion)}><span>{conversion.profileName || "Private voice"} · {conversion.mode.toLowerCase()}</span><small>{conversion.status.toLowerCase()} · {conversion.progress}%</small></button>)}</div>}
        </aside>
        <section className="voice-arrangement-shell" aria-label="Arrangement editor shell">
          <div className="arrangement-ruler" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => <span key={bar}>{bar}</span>)}</div>
          {lanes.map((lane) => (
            <div className="voice-lane" key={lane.role}>
              <header><strong>{lane.name}</strong><small>{lane.role}</small></header>
              <div>{lane.role === "LEAD" && activeConversion ? <button type="button" className={`voice-region ${activeConversion.status.toLowerCase()}`}><strong>{activeConversion.profileName || selectedVoice?.displayName || "Private voice"}</strong><span>{activeConversion.mode === "PREVIEW" ? "30-second preview" : "Full conversion"} · {activeConversion.status.toLowerCase()}</span><i style={{ width: `${activeConversion.progress}%` }} /></button> : <span>{lane.role === "LEAD" ? "Upload a permitted performance to begin" : "Available in the harmony phase"}</span>}</div>
            </div>
          ))}
          {!activeConversion && <div className="voice-studio-empty"><strong>Ready for a source performance</strong><span>Choose an active private voice, upload your vocal or song, then preview or convert.</span></div>}
          {activeConversion?.status === "COMPLETE" && <div className="voice-conversion-audio"><div><span>Converted song</span>{/* Musical performances do not have a caption track. */}<audio aria-label="Converted song" controls preload="metadata" src={activeConversion.masterAudioUrl} /></div><div><span>Converted lead vocal</span>{/* Musical performances do not have a caption track. */}<audio aria-label="Converted lead vocal" controls preload="metadata" src={activeConversion.vocalAudioUrl} /></div></div>}
        </section>
        <aside className="voice-processing-panel">
          <div className="panel-title"><span>Voice conversion</span></div>
          <dl><div><dt>Project access</dt><dd>{selectedProject?.role || "—"}</dd></div><div><dt>Voice</dt><dd>{selectedVoice?.displayName || "Choose one"}</dd></div><div><dt>Model</dt><dd>{selectedVoice?.providerModel || "—"}</dd></div><div><dt>Outputs</dt><dd>Master + vocal stem</dd></div></dl>
          <label className="voice-source-upload">SOURCE PERFORMANCE<input type="file" accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,.wav,.flac,.mp3,.m4a,.ogg,.webm" disabled={conversionBusy} onChange={(event) => setSourceFile(event.target.files?.[0] || null)} /><span>{sourceFile?.name || "Choose owned vocal or song"}</span></label>
          <label className="voice-strength">VOICE IDENTITY <output>{voiceStrength}%</output><input type="range" min="0" max="100" value={voiceStrength} onChange={(event) => setVoiceStrength(Number(event.target.value))} /></label>
          <label className="voice-conversion-consent"><input type="checkbox" checked={rightsAttested} onChange={(event) => setRightsAttested(event.target.checked)} /><span>I own or control this performance and authorize this private conversion.</span></label>
          <button disabled={!canConvert || !engine?.capabilities.preview} onClick={() => void startConversion("PREVIEW")}>{conversionBusy ? "Preparing…" : "Create 30-second preview"}</button>
          <button className="render" disabled={!canConvert || !engine?.capabilities.singingVoiceConversion} onClick={() => void startConversion("FULL")}>{conversionBusy ? "Preparing…" : "Convert full performance"}</button>
          {activeConversion && !terminal.has(activeConversion.status) && <div className="voice-job-progress" role="status"><progress max="100" value={activeConversion.progress} /><span>{activeConversion.status.toLowerCase()} · {activeConversion.progress}%</span></div>}
          {activeConversion && !terminal.has(activeConversion.status) && <button type="button" className="cancel" disabled={conversionBusy} onClick={() => void cancelConversion()}>Cancel conversion</button>}
          {activeConversion?.status === "FAILED" && <p role="alert">Conversion failed: {activeConversion.errorMessage || activeConversion.errorCode || "unknown error"}. Your source is unchanged.</p>}
          <p>RVC changes vocal identity while preserving the uploaded performance. Preview is capped server-side at 30 seconds. Results remain private and non-destructive.</p>
        </aside>
      </div>
      <footer className="voice-studio-transport" aria-label="Voice Studio transport"><button disabled aria-label="Return to start">|◀</button><button disabled aria-label="Play">▶</button><button disabled aria-label="Stop">■</button><span>00:00.000</span><i /><span>120 BPM</span><span>1.1.000</span></footer>
    </section>
  );
}

async function readAudioMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("The selected file is not readable audio."));
    });
    if (!Number.isFinite(audio.duration) || audio.duration < 1 || audio.duration > 600)
      throw new Error("Choose an audio performance between 1 second and 10 minutes.");
    return { duration: audio.duration, sampleRate: 48000, channels: 2 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
