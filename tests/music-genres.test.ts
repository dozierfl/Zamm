import assert from "node:assert/strict";
import test from "node:test";
import { inferGenre } from "../lib/music-genres.ts";
import { compose, createGenerationSchema } from "../lib/domain.ts";

test("genre detection recognizes styles beyond the pop fallback", () => {
  for (const [prompt, genre] of [
    ["Warm neo-soul song", "Neo-soul"],
    ["Traditional country ballad", "Country"],
    ["Gospel choir performance", "Gospel"],
    ["A jazz trio", "Jazz"],
    ["Classic R&B groove", "R&B"],
    ["Hip hop with strings", "Hip-hop"],
  ]) assert.equal(inferGenre(prompt), genre);
  assert.equal(inferGenre("A song about tomorrow"), "Alternative pop");
});
test("an explicit custom genre overrides prompt detection in the provider plan", () => {
  const plan = compose(createGenerationSchema.parse({ prompt: "Warm soul performance", genre: "Country gospel" }));
  assert.equal(plan.genre, "Country gospel");
  assert.match(plan.generationCaption, /Country gospel/);
});
