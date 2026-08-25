import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("startup launcher only loads ACE-Step for the ACE-Step provider",async()=>{
  const script=await readFile(new URL("../scripts/start-dozi-studio.command",import.meta.url),"utf8");
  assert.match(script,/MUSIC_PROVIDER/);
  assert.match(script,/if \[\[ "\$PROVIDER" == "acestep" \]\]/);
  assert.match(script,/elif \[\[ "\$PROVIDER" == "ai-service" \]\]/);
  assert.match(script,/Hosted\/local provider needs no separate model process/);
  assert.ok(script.indexOf('if [[ "$PROVIDER" == "acestep" ]]')<script.indexOf('exec uv run acestep-api'));
});
