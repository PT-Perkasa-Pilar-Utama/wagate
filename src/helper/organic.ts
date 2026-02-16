// ─── Organic Message Generator ───────────────────────────────────
// Creates realistic-looking warm-up messages to make traffic
// appear human and avoid WhatsApp spam detection.
// ─────────────────────────────────────────────────────────────────

const GREETINGS = [
  "hey",
  "hi",
  "halo",
  "yo",
  "woi",
  "eh",
  "bro",
  "mas",
  "bang",
  "kak",
];

const CASUAL_QUESTIONS = [
  "gimana kabarnya?",
  "lagi apa?",
  "udah makan belum?",
  "sibuk ga?",
  "ada waktu?",
  "lagi ngapain?",
  "apa kabar?",
  "sehat?",
  "udah tidur belum?",
  "kerja ga hari ini?",
];

const ACKNOWLEDGMENTS = [
  "ok",
  "oke",
  "siap",
  "sip",
  "yoi",
  "betul",
  "iya",
  "yap",
  "paham",
  "noted",
  "mantap",
  "gas",
];

const FILLERS = [
  "btw",
  "oh iya",
  "ngomong2",
  "eh iya",
  "bentar",
  "wait",
  "hmm",
  "nah",
  "jadi gini",
  "coba cek",
];

const EMOJIS = [
  "😊",
  "👍",
  "🙏",
  "😁",
  "💪",
  "🔥",
  "✅",
  "😂",
  "🤙",
  "👌",
  "😄",
  "🎉",
  "🫡",
];

// ─── Helpers ─────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = randomInt(minMs, maxMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ~10% chance to introduce a subtle typo (char swap)
 */
function maybeTypo(text: string): string {
  if (Math.random() > 0.1 || text.length < 4) return text;
  const i = randomInt(1, text.length - 2);
  const chars = text.split("");
  [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  return chars.join("");
}

/**
 * ~30% chance to append a random emoji
 */
function maybeEmoji(text: string): string {
  if (Math.random() > 0.3) return text;
  return `${text} ${pick(EMOJIS)}`;
}

/**
 * ~40% chance to use lowercase only (casual texting style)
 */
function maybeLowercase(text: string): string {
  if (Math.random() > 0.4) return text;
  return text.toLowerCase();
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Generate a single warm-up message that looks organic.
 * Optionally mixes in fragments of the real content to
 * make the conversation contextually related.
 */
export function generateWarmupMessage(baseContent?: string): string {
  const strategy = randomInt(1, 5);

  switch (strategy) {
    case 1:
      // Greeting + casual question
      return maybeEmoji(
        maybeLowercase(`${pick(GREETINGS)}, ${pick(CASUAL_QUESTIONS)}`),
      );

    case 2:
      // Simple acknowledgment
      return maybeEmoji(maybeTypo(maybeLowercase(pick(ACKNOWLEDGMENTS))));

    case 3:
      // Filler + fragment of real content
      if (baseContent && baseContent.length > 10) {
        const words = baseContent.split(" ");
        const fragment = words
          .slice(0, Math.min(randomInt(2, 4), words.length))
          .join(" ");
        return maybeLowercase(`${pick(FILLERS)}, ${maybeTypo(fragment)}`);
      }
      return maybeEmoji(
        maybeLowercase(`${pick(FILLERS)}, ${pick(CASUAL_QUESTIONS)}`),
      );

    case 4:
      // Just a greeting
      return maybeEmoji(maybeLowercase(pick(GREETINGS)));

    case 5:
    default:
      // Acknowledgment + filler
      return maybeLowercase(
        `${pick(ACKNOWLEDGMENTS)} ${pick(FILLERS)}`.trim(),
      );
  }
}

/**
 * Generate multiple warm-up messages.
 */
export function generateWarmupMessages(
  count: number,
  baseContent?: string,
): string[] {
  const messages: string[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(generateWarmupMessage(baseContent));
  }
  return messages;
}
