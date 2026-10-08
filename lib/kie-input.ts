import type { GenerationRequest } from "./domain";

export function kieInput(request: GenerationRequest, model: string, cover = false) {
  const plan = request.compositionPlan;
  const lyrics = plan.vocal.enabled ? request.lyrics?.trim() || "" : "";
  if (lyrics.length > 5000) throw new Error("KIE_LYRICS_TOO_LONG");
  const custom = cover || !plan.vocal.enabled || Boolean(lyrics);
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
    negative_tags: plan.negativeInstructions.join(", ").slice(0, 500),
    ...(custom ? { duration: Math.min(360, Math.max(10, plan.durationSeconds)) } : {}),
    ...(custom && plan.vocal.enabled && plan.vocal.gender && plan.vocal.gender !== "auto"
      ? { vocal_gender: plan.vocal.gender === "male" ? "m" : "f" } : {}),
  };
}
