"use client";

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
};

const lanes = [
  { name: "Lead Vocal", role: "LEAD" },
  { name: "Background Vocals", role: "BGV" },
  { name: "Harmony", role: "HARMONY" },
];

export function VoiceStudio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const loadFoundation = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [projectsResponse, voicesResponse] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/voice-library", { cache: "no-store" }),
      ]);
      if (!projectsResponse.ok || !voicesResponse.ok)
        throw new Error("Voice Studio could not load its project foundation.");
      const projectData = (await projectsResponse.json()) as { projects: Project[] };
      const voiceData = (await voicesResponse.json()) as { voices: Voice[] };
      setProjects(projectData.projects);
      setVoices(voiceData.voices);
      setSelectedProjectId((current) => {
        const saved = window.localStorage.getItem("dozi:voice-studio:project");
        return projectData.projects.some((project) => project.id === current)
          ? current
          : projectData.projects.some((project) => project.id === saved)
            ? saved || ""
            : projectData.projects[0]?.id || "";
      });
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

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  return (
    <section className="voice-studio" aria-label="Voice Studio editor foundation">
      <header className="voice-studio-heading">
        <div>
          <p>VOICE ARRANGEMENT WORKSPACE</p>
          <h2>{selectedProject?.title || "Voice Studio"}</h2>
        </div>
        <div className="voice-studio-project">
          <label htmlFor="voice-studio-project">PROJECT</label>
          <select
            id="voice-studio-project"
            value={selectedProjectId}
            disabled={busy || projects.length === 0}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title} · {project.role.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </header>
      {error && <p className="voice-studio-error" role="alert">{error}</p>}
      <div className="voice-studio-grid">
        <aside className="voice-studio-library">
          <div className="panel-title">
            <span>Audio & voice library</span>
            <small>{voices.length} private voices</small>
          </div>
          <form onSubmit={createProject} className="voice-project-create">
            <input
              aria-label="New Voice Studio project name"
              value={projectTitle}
              maxLength={120}
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder="New project name"
            />
            <button disabled={busy || !projectTitle.trim()}>Create</button>
          </form>
          <div className="voice-library-list">
            {voices.map((voice) => (
              <article key={voice.id}>
                <i aria-hidden="true">V</i>
                <div>
                  <strong>{voice.displayName}</strong>
                  <span>
                    {voice.usageStatus === "AVAILABLE"
                      ? `Model V${voice.activeVersionNumber}`
                      : "Enrollment required"}
                  </span>
                </div>
                <em className={voice.authorizationStatus.toLowerCase()}>
                  {voice.authorizationStatus === "VERIFIED" ? "Verified" : "Private"}
                </em>
              </article>
            ))}
            {!busy && voices.length === 0 && (
              <p>No authorized voices yet. Use My Voice to begin enrollment.</p>
            )}
          </div>
        </aside>
        <section className="voice-arrangement-shell" aria-label="Arrangement editor shell">
          <div className="arrangement-ruler" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => <span key={bar}>{bar}</span>)}
          </div>
          {lanes.map((lane) => (
            <div className="voice-lane" key={lane.role}>
              <header><strong>{lane.name}</strong><small>{lane.role}</small></header>
              <div><span>Choose a song and source vocal in Phase 3</span></div>
            </div>
          ))}
          <div className="voice-studio-empty">
            <strong>Editor foundation ready</strong>
            <span>Audio analysis and lyric-aligned regions arrive in Phase 3.</span>
          </div>
        </section>
        <aside className="voice-processing-panel">
          <div className="panel-title"><span>Processing & editor</span></div>
          <dl>
            <div><dt>Project access</dt><dd>{selectedProject?.role || "—"}</dd></div>
            <div><dt>Voice scope</dt><dd>Private owner only</dd></div>
            <div><dt>Song assets</dt><dd>{selectedProject?.songCount ?? 0}</dd></div>
            <div><dt>Editing</dt><dd>Non-destructive</dd></div>
          </dl>
          <button disabled>Preview selection</button>
          <button className="render" disabled>Render vocals</button>
          <p>Conversion and rendering activate after the Phase 2 voice engine is connected.</p>
        </aside>
      </div>
      <footer className="voice-studio-transport" aria-label="Voice Studio transport">
        <button disabled aria-label="Return to start">|◀</button>
        <button disabled aria-label="Play">▶</button>
        <button disabled aria-label="Stop">■</button>
        <span>00:00.000</span><i /><span>120 BPM</span><span>1.1.000</span>
      </footer>
    </section>
  );
}
