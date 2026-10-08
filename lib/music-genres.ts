export const musicGenres = ["Alternative pop", "Pop", "Neo-soul", "R&B", "Soul", "Gospel", "Hip-hop", "Jazz", "Blues", "Rock", "Country", "Folk", "Reggae", "Afrobeats", "Latin", "Electronic", "House", "Classical", "Ambient"];

export function inferGenre(prompt: string): string {
  const aliases: [RegExp, string][] = [
    [/\bneo[- ]?soul\b/i, "Neo-soul"],
    [/\b(?:r&b|rnb|rhythm and blues)\b/i, "R&B"],
    [/\b(?:hip[- ]?hop|rap)\b/i, "Hip-hop"],
    [/\b(?:edm|techno)\b/i, "Electronic"],
  ];
  for (const [pattern, genre] of aliases) if (pattern.test(prompt)) return genre;
  for (const genre of musicGenres) {
    if (new RegExp(`\\b${genre}\\b`, "i").test(prompt)) return genre;
  }
  return "Alternative pop";
}
