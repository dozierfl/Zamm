import assert from "node:assert/strict";
import test from "node:test";
import { audioRange, AUDIO_RANGE_CHUNK_BYTES } from "../lib/audio-range.ts";

test("open-ended playback and seeking use bounded, contiguous chunks", () => {
  const size = 4414923;
  let offset = 0;
  while (offset < size) {
    const range = audioRange(`bytes=${offset}-`, size)!;
    assert.equal(range.start, offset);
    assert.ok(range.end - range.start + 1 <= AUDIO_RANGE_CHUNK_BYTES);
    offset = range.end + 1;
  }
  assert.equal(offset, size);
});
test("audio ranges support explicit and suffix requests and reject invalid ranges", () => {
  assert.deepEqual(audioRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(audioRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.deepEqual(audioRange("bytes=90-200", 100), { start: 90, end: 99 });
  for (const header of ["bytes=", "bytes=-", "bytes=-0", "bytes=100-", "bytes=10-2", "bytes=0-1,3-4", "bytes=9999999999999999999-"]) {
    assert.equal(audioRange(header, 100), null);
  }
});
