import type { GenerationRequest } from "./domain";

type KieMusicInput = {
  prompt: string;
  custom_mode: boolean;
  instrumental: boolean;
  model: string;
  style: string;
  title: string;
  negative_tags: string;
  duration?: number;
  lyrics?: string;
  vocal_gender?: "m" | "f";
  style_weight?: number;
  weirdness_constraint?: number;
  audio_weight?: number;
  variety?: number;
  persona_id?: string;
  persona_model?: "style_persona" | "voice_persona";
};
type KieCoverInput = {
  instrumental: boolean;
  model: string;
  style?: string;
  title?: string;
  negative_tags?: string;
  lyrics?: string;
  vocal_gender?: "m" | "f";
  style_weight?: number;
  weirdness_constraint?: number;
  audio_weight?: number;
  variety?: number;
  persona_id?: string;
  persona_model?: "style_persona" | "voice_persona";
};

function kieControls(request: GenerationRequest, custom: boolean, vocals = true) {
  if (!custom) return {};
  const options = request.providerOptions || {};
  const fraction = (key: string) => {
    const value = options[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.round(Math.max(0, Math.min(100, value)) / 100 * 100) / 100;
  };
  const variety = options.variety;
  const personaId = typeof options.personaId === "string" ? options.personaId.trim().slice(0, 200) : "";
  const personaModel: "style_persona" | "voice_persona" | undefined = options.personaModel === "style_persona" || options.personaModel === "voice_persona" ? options.personaModel : undefined;
  return {
    ...(fraction("styleWeight") !== undefined ? { style_weight: fraction("styleWeight") } : {}),
    ...(fraction("weirdnessConstraint") !== undefined ? { weirdness_constraint: fraction("weirdnessConstraint") } : {}),
    ...(vocals && fraction("audioWeight") !== undefined ? { audio_weight: fraction("audioWeight") } : {}),
    ...(typeof variety === "number" && Number.isInteger(variety) && variety >= 0 && variety <= 4 ? { variety } : {}),
    ...(personaId ? { persona_id: personaId } : {}),
    ...(personaModel && personaId ? { persona_model: personaModel } : {}),
  };
}

function negativeTags(request: GenerationRequest, fallback: string[]) {
  const supplied = request.providerOptions?.negativeTags;
  const tags = typeof supplied === "string" ? supplied.trim() : "";
  return tags || fallback.join(", ");
}

export function kieInput(request: GenerationRequest, model: string): KieMusicInput;
export function kieInput(
  request: GenerationRequest,
  model: string,
  cover: true,
): KieCoverInput;
export function kieInput(
  request: GenerationRequest,
  model: string,
  cover = false,
): KieMusicInput | KieCoverInput {
  const plan = request.compositionPlan;
  const lyrics = plan.vocal.enabled ? request.lyrics?.trim() || "" : "";
  if (lyrics.length > 5000) throw new Error("KIE_LYRICS_TOO_LONG");
  // Kie's current upload-and-cover endpoint derives the performance from the
  // uploaded recording.  Unlike text-to-music, it does not need custom mode
  // or a placeholder lyric prompt to create a vocal cover. Sending the old
  // custom-mode shape with an empty prompt makes otherwise valid covers fail.
  if (cover) {
    const style = [
      plan.genre,
      plan.mood.join(", "),
      `${plan.bpm} BPM`,
      plan.tonalitySpecified === false ? undefined : `${plan.key} ${plan.scale}`,
      plan.styleDirection,
      plan.generationCaption,
    ]
      .filter(Boolean)
      .join(". ");
    if (style.length > 1000) throw new Error("KIE_STYLE_TOO_LONG");
    return {
      instrumental: !plan.vocal.enabled,
      model,
      ...(style ? { style } : {}),
      ...(plan.titleSuggestions[0]
        ? { title: plan.titleSuggestions[0].slice(0, 80) }
        : {}),
      ...(negativeTags(request, plan.negativeInstructions)
        ? { negative_tags: negativeTags(request, plan.negativeInstructions).slice(0, 500) }
        : {}),
      ...(lyrics ? { lyrics } : {}),
      ...(plan.vocal.enabled && plan.vocal.gender && plan.vocal.gender !== "auto"
        ? { vocal_gender: plan.vocal.gender === "male" ? "m" : "f" }
        : {}),
      ...kieControls(request, true, plan.vocal.enabled),
    };
  }
  const custom = !plan.vocal.enabled || Boolean(lyrics);
  const vocal = plan.vocal.enabled ? `Vocal: ${plan.vocal.tone}; ${plan.vocal.delivery}` : "Instrumental only; no vocals";
  const controls = `${plan.genre}; ${plan.mood.join(", ")}; ${plan.bpm} BPM; ${plan.tonalitySpecified === false ? "choose a fitting key" : `${plan.key} ${plan.scale}`}; ${vocal}`;
  const explicit = [plan.styleDirection, custom ? plan.songIdea : undefined].filter(Boolean).join(". ");
  // Never silently truncate the user's instructions or lyrics. Preset details
  // are optional and fill only the remaining provider style budget.
  const primary = [controls, explicit || (!plan.songIdea ? plan.generationCaption : "")].filter(Boolean).join(". ");
  if (primary.length > 1000) throw new Error("KIE_STYLE_TOO_LONG");
  const suggested = [plan.instrumentation.length ? `Instruments: ${plan.instrumentation.map(i => i.instrument).join(", ")}` : "", ...plan.structure.map(s => s.description)].filter(Boolean);
  let style = primary;
  for (const part of suggested) if (style.length + part.length + 2 <= 1000) style += `. ${part}`;
  return {
    prompt: custom ? lyrics : plan.songIdea || plan.generationCaption,
    custom_mode: custom, instrumental: !plan.vocal.enabled, model, style,
    title: (plan.titleSuggestions[0] || "Dozi song").slice(0, 80),
    negative_tags: negativeTags(request, plan.negativeInstructions).slice(0, 500),
    ...(lyrics ? { lyrics } : {}),
    ...(custom ? { duration: Math.min(360, Math.max(10, plan.durationSeconds)) } : {}),
    ...(custom && plan.vocal.enabled && plan.vocal.gender && plan.vocal.gender !== "auto"
      ? { vocal_gender: plan.vocal.gender === "male" ? "m" : "f" } : {}),
    ...kieControls(request, custom, plan.vocal.enabled),
  };
}
