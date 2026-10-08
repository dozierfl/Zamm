// Keep browser playback responses short-lived across the local Worker proxy.
export const AUDIO_RANGE_CHUNK_BYTES = 256 * 1024;

export function audioRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const suffix = !match[1];
  if (suffix && last === 0) return null;
  const start = suffix ? Math.max(0, size - last) : first;
  const requestedEnd = suffix || !match[2] ? size - 1 : Math.min(last, size - 1);
  if (start >= size || start > requestedEnd) return null;
  // Honor explicit ranges (including suffix probes); bound open-ended playback.
  const end = match[1] && !match[2]
    ? Math.min(requestedEnd, start + AUDIO_RANGE_CHUNK_BYTES - 1)
    : requestedEnd;
  return { start, end };
}
