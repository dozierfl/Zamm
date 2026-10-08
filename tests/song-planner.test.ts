import assert from "node:assert/strict";
import test from "node:test";
import { compose, createGenerationSchema } from "../lib/domain.ts";
import { planSong } from "../lib/song-planner.ts";
import { kieInput } from "../lib/kie-input.ts";
import { validateElevenLabsPolicy } from "../lib/provider-policy.ts";

const base = { prompt: "A song about coming home" };
function payload(input: Record<string, unknown>) {
  const parsed = createGenerationSchema.parse({ ...base, ...input });
  return kieInput({ jobId: "j", userId: "u", songId: "s", versionId: "v", seed: 1, outputMode: "MASTER_ONLY", compositionPlan: compose(parsed), lyrics: parsed.lyrics }, "V6");
}
test("genre palettes and automatic vocals are distinct", () => {
  const country = planSong({ ...base, genre: "Country" });
  const rock = planSong({ ...base, genre: "Rock" });
  assert.ok(country.instrumentation.some(i => i.instrument === "Pedal steel"));
  assert.ok(rock.instrumentation.some(i => i.instrument === "Electric guitars"));
  assert.match(country.vocal.tone, /country/);
  assert.match(rock.vocal.tone, /rock/);
  assert.notDeepEqual(country.instrumentation, rock.instrumentation);
  assert.ok(!rock.instrumentation.some(i => /Rhodes/.test(i.instrument)));
});
test("explicit direction wins over preset instrumentation and remains in provider style", () => {
  for (const style of ["Solo harp, no drums, freely paced", "A cappella choir; no instruments"]) {
    const plan = planSong({ ...base, genre: "Rock", style });
    assert.deepEqual(plan.instrumentation, []);
    assert.ok(payload({ genre: "Rock", style, lyrics: "[Verse]\nHome again" }).style.includes(style));
  }
  assert.deepEqual(planSong({ prompt: "Solo piano, no bass or drums", genre: "Soul" }).instrumentation, []);
});
test("vocal gender and singing style are independent, with instrumental suppression", () => {
  const female = payload({ genre: "Country", vocalGender: "female", vocalStyle: "Soul", lyrics: "Home again" });
  assert.equal(female.vocal_gender, "f");
  assert.match(female.style, /female vocalist; expressive, resonant soul/);
  const male = payload({ vocalGender: "male", lyrics: "Home again" });
  assert.equal(male.vocal_gender, "m");
  const instrumental = payload({ instrumental: true, vocalGender: "female", vocalStyle: "Soul", lyrics: "Never sing this" });
  assert.equal(instrumental.vocal_gender, undefined);
  assert.equal(instrumental.prompt, "");
  assert.doesNotMatch(instrumental.style, /female vocalist|soul delivery/);
});
test("automatic lyrics use the idea, supplied lyrics use custom mode unchanged", () => {
  const automatic = payload({ vocalGender: "female", style: "Airy acoustic folk" });
  assert.equal(automatic.custom_mode, false);
  assert.equal(automatic.prompt, base.prompt);
  assert.equal(automatic.duration, undefined);
  assert.equal(automatic.vocal_gender, undefined);
  assert.match(automatic.style, /female vocalist/);
  const lyrics = "[Verse]\nComing home\n[Chorus]\nHere I am";
  const custom = payload({ lyrics, durationSeconds: 180 });
  assert.equal(custom.custom_mode, true);
  assert.equal(custom.prompt, lyrics);
  assert.equal(custom.duration, 180);
  assert.ok(custom.style.includes(base.prompt));
});
test("prompt tempo and key are respected, manual controls take precedence", () => {
  const inferred = planSong({ prompt: "A country song at 92 BPM in D minor" });
  assert.equal(inferred.bpm, 92);
  assert.equal(inferred.key, "D");
  assert.equal(inferred.scale, "minor");
  const explicit = planSong({ prompt: "A rock song at 92 BPM in D minor", bpm: 120, key: "E", scale: "major" });
  assert.equal(explicit.bpm, 120);
  assert.equal(explicit.key, "E");
  assert.equal(explicit.scale, "major");
  assert.equal(planSong(base).tonalitySpecified, false);
});
test("long inputs are rejected instead of silently changing the song", () => {
  assert.throws(() => payload({ lyrics: "x".repeat(5001) }), /KIE_LYRICS_TOO_LONG/);
  assert.throws(() => payload({ prompt: "x".repeat(500), style: "x".repeat(500), lyrics: "Test" }), /KIE_STYLE_TOO_LONG/);
  assert.throws(() => validateElevenLabsPolicy({ ...base, lyrics: "", style: "sing like a famous artist", providerPolicyAccepted: true }), /PROVIDER_PROMPT_REJECTED/);
});
