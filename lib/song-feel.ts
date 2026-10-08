export function songMood(prompt: string, feel?: string): string[] {
  if (feel?.trim()) return [feel.trim()];
  const text = prompt.toLowerCase();
  return [text.includes("warm") ? "Warm" : "Intimate", text.includes("purpose") ? "Hopeful" : "Reflective"];
}
