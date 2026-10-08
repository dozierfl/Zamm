import type { CompositionPlan } from "./domain";
import { inferGenre } from "./music-genres";
import { songMood } from "./song-feel";

export const vocalStyles = ["Auto", "Soul", "Rock", "Country", "Pop", "R&B", "Gospel", "Jazz", "Rap", "Folk", "Classical"] as const;
export type VocalStyle = (typeof vocalStyles)[number];
export type VocalGender = "auto" | "male" | "female";
export interface SongDirection {
  prompt: string; title?: string; genre?: string; style?: string; feel?: string;
  instrumental?: boolean; vocalGender?: VocalGender; vocalStyle?: VocalStyle;
  bpm?: number; key?: string; scale?: string; durationSeconds?: number;
}
const palettes: Array<{ match: RegExp; instruments: string[]; bpm: number; voice: string; arrangement: string }> = [
  { match: /country|bluegrass/i, instruments: ["Acoustic guitar", "Pedal steel", "Bass", "Live drums"], bpm: 96, voice: "Country", arrangement: "Storytelling verses, memorable chorus, instrumental turnaround" },
  { match: /rock|metal|punk/i, instruments: ["Electric guitars", "Bass", "Live drums"], bpm: 120, voice: "Rock", arrangement: "Guitar-led verses, dynamic chorus, contrasting bridge" },
  { match: /gospel/i, instruments: ["Piano", "Organ", "Bass", "Live drums"], bpm: 84, voice: "Gospel", arrangement: "Call and response, gradually building ensemble, uplifting final refrain" },
  { match: /jazz|swing/i, instruments: ["Piano", "Upright bass", "Brushed drums"], bpm: 100, voice: "Jazz", arrangement: "Melodic head, responsive ensemble interplay, tasteful instrumental space" },
  { match: /blues/i, instruments: ["Blues guitar", "Bass", "Live drums"], bpm: 80, voice: "Soul", arrangement: "Blues phrasing, instrumental responses, expressive dynamic arc" },
  { match: /hip.?hop|rap|trap/i, instruments: ["Drum machine", "Sub bass", "Sample textures"], bpm: 90, voice: "Rap", arrangement: "Rhythmic verses, concise hook, beat variations and a contrasting break" },
  { match: /soul|r&b|rnb/i, instruments: ["Electric piano", "Bass", "Live drums"], bpm: 82, voice: "Soul", arrangement: "Expressive verses, rich chorus harmony, a contrasting bridge" },
  { match: /folk|acoustic|singer.songwriter/i, instruments: ["Acoustic guitar", "Upright bass", "Light percussion"], bpm: 88, voice: "Folk", arrangement: "Intimate verses, natural dynamics, space around the melody" },
  { match: /reggae/i, instruments: ["Offbeat guitar", "Organ", "Bass", "One-drop drums"], bpm: 78, voice: "Soul", arrangement: "Syncopated verses, spacious refrain, dub-inspired instrumental breaks" },
  { match: /afrobeat/i, instruments: ["Interlocking guitars", "Bass", "Layered percussion"], bpm: 108, voice: "Pop", arrangement: "Interlocking rhythmic parts, melodic hooks, gradual layers" },
  { match: /latin|salsa|bossa/i, instruments: ["Piano", "Bass", "Latin percussion", "Brass"], bpm: 110, voice: "Pop", arrangement: "Rhythmic ensemble interplay, melodic chorus, percussion breaks" },
  { match: /classical|orchestral|cinematic/i, instruments: ["Strings", "Woodwinds", "Brass", "Orchestral percussion"], bpm: 76, voice: "Classical", arrangement: "Developing themes, orchestral contrast, deliberate resolution" },
  { match: /ambient/i, instruments: ["Atmospheric pads", "Evolving textures"], bpm: 65, voice: "Pop", arrangement: "Slowly evolving layers, spacious phrasing, gentle resolution" },
  { match: /electronic|house|techno|edm|dance/i, instruments: ["Synthesizers", "Electronic drums", "Synth bass"], bpm: 124, voice: "Pop", arrangement: "Build, release, breakdown, and evolving electronic layers" },
];
const vocalCharacters: Record<string, string> = {
  Soul: "expressive, resonant soul delivery with tasteful melisma",
  Rock: "powerful, gritty rock delivery with clear phrasing",
  Country: "natural country inflection and conversational storytelling",
  Pop: "clear, melodic pop delivery with a memorable hook",
  "R&B": "smooth R&B phrasing with rhythmic nuance",
  Gospel: "resonant gospel delivery with dynamic emotional lift",
  Jazz: "nuanced jazz phrasing with relaxed rhythmic placement",
  Rap: "rhythmic rap delivery with clear diction and intentional flow",
  Folk: "intimate, unforced storytelling with natural phrasing",
  Classical: "supported classical tone with sustained legato",
};

export function planSong(request: SongDirection): CompositionPlan {
  const idea = request.prompt.trim();
  const style = request.style?.trim() || "";
  const genre = request.genre?.trim() || inferGenre(`${style} ${idea}`);
  const palette = palettes.find(item => item.match.test(genre));
  const text = `${style} ${idea}`;
  // Explicit instrumentation/arrangement directions take precedence over presets.
  // Keep the full text for the model, including exclusions and instruments we don't recognize.
  const directed = Boolean(style) || /\b(guitar|piano|rhodes|drums?|bass|strings|violin|banjo|synth|percussion|horns?|saxophone|flute|harp|organ|a cappella|acapella|solo|orchestra|arrangement|instrumentation)\b/i.test(idea);
  const instruments = directed ? [] : (palette?.instruments ?? ["Melodic accompaniment", "Bass", "Percussion"]);
  const arrangement = directed ? "Follow the supplied style and song idea; do not add a preset ensemble." : (palette?.arrangement ?? "Develop the song around its melody, with contrasting sections and a clear ending");
  const gender = request.vocalGender && request.vocalGender !== "auto" ? request.vocalGender : /\bfemale (?:voice|vocal|singer)/i.test(text) ? "female" : /\bmale (?:voice|vocal|singer)/i.test(text) ? "male" : "auto";
  const voice = request.vocalStyle && request.vocalStyle !== "Auto" ? request.vocalStyle : palette?.voice;
  const tone = request.instrumental ? "No vocals" : `${gender === "auto" ? "" : `${gender} vocalist; `}${voice ? vocalCharacters[voice] : `vocal character suited to ${genre}`}`;
  const mood = songMood(text, request.feel);
  const promptTempo = text.match(/\b(\d{2,3})\s*bpm\b/i);
  const bpm = request.bpm ?? (promptTempo && Number(promptTempo[1]) >= 40 && Number(promptTempo[1]) <= 220 ? Number(promptTempo[1]) : undefined) ?? (/\b(slow|ballad)\b/i.test(text) ? 72 : palette?.bpm ?? 100);
  const promptKey = text.match(/\b([A-G][#b]?)\s+(major|minor)\b/i);
  const key = request.key ?? promptKey?.[1] ?? "C", scale = request.scale ?? promptKey?.[2]?.toLowerCase() ?? "major";
  const tonalitySpecified = Boolean(request.key || promptKey);
  const direction = [style && `Style: ${style}`, `Song idea: ${idea}`].filter(Boolean).join(". ");
  return {
    titleSuggestions: [request.title?.trim() || idea.split(/\s+/).slice(0, 6).join(" ").slice(0, 80) || "Untitled song"],
    genre, subgenres: [], mood, bpm, key, scale, timeSignature: "4/4", durationSeconds: request.durationSeconds ?? 180,
    instrumentation: instruments.map(instrument => ({ instrument, role: "ensemble", character: `suited to ${genre}` })),
    vocal: { enabled: !request.instrumental, role: "LEAD", tone, delivery: request.instrumental ? "Instrumental only" : "Follow the lyric sections and emotional arc", gender: request.instrumental ? "auto" : gender },
    structure: [{ type: "arrangement", bars: 16, energy: 0.6, description: arrangement }],
    songIdea: idea, styleDirection: style, tonalitySpecified,
    generationCaption: `${genre}, ${bpm} BPM, ${tonalitySpecified ? `${key} ${scale}` : "model-selected key"}; ${mood.join(", ")}; ${direction}`,
    negativeInstructions: request.instrumental ? ["vocals", "spoken words"] : [],
  };
}
