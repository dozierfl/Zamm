import assert from "node:assert/strict";
import test from "node:test";
import { compose, createGenerationSchema } from "../lib/domain.ts";
import { songMood } from "../lib/song-feel.ts";
import { KieMusicProvider } from "../lib/providers.ts";

test("Feel overrides inferred mood and clearing it restores the prompt default", () => {
  const prompt = "Warm soul song about finding purpose";
  for (const feel of [undefined, "", "   "]) {
    const plan = compose(createGenerationSchema.parse({ prompt, feel }));
    assert.deepEqual(plan.mood, songMood(prompt));
  }
  const plan = compose(createGenerationSchema.parse({ prompt, feel: "  Dark and tense  " }));
  assert.deepEqual(plan.mood, ["Dark and tense"]);
  assert.match(plan.generationCaption, /Dark and tense/);
  assert.equal(createGenerationSchema.safeParse({ prompt, feel: "x".repeat(161) }).success, false);
});

test("Kie receives the chosen Feel in its music style", async () => {
  const original = globalThis.fetch;
  let style = "";
  globalThis.fetch = async (_url, init) => {
    style = JSON.parse(String(init?.body)).input.style;
    return new Response(null, { status: 401 });
  };
  try {
    const compositionPlan = compose(createGenerationSchema.parse({ prompt: "A warm soul song", feel: "Joyful and uplifting" }));
    await assert.rejects(new KieMusicProvider("test-key").generate({ jobId: "j", userId: "u", songId: "s", versionId: "v", compositionPlan, seed: 1, outputMode: "MASTER_ONLY" }), /PROVIDER_AUTHORIZATION_FAILED/);
    assert.match(style, /Joyful and uplifting/);
  } finally {
    globalThis.fetch = original;
  }
});
