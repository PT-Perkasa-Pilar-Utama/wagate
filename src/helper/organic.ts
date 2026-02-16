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
  "di rumah ga?",
  "lagi di mana?",
  "masih bangun?",
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
  "oke deh",
  "bisa bisa",
  "siap laksanakan",
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
  "gini loh",
  "tau ga",
  "eh dengerin dulu",
];

const FOLLOW_UPS = [
  "gimana menurut lo?",
  "bisa ga ya?",
  "coba pikirin deh",
  "lu setuju ga?",
  "menurut gw sih bisa",
  "harusnya sih gampang",
  "gw rasa oke",
  "kayaknya bener deh",
  "cek dulu ya",
  "nanti gw kabarin lagi",
  "gw liat dulu ya",
  "tar gw konfirm",
];

const REACTIONS = [
  "haha nice",
  "wkwk",
  "wkwkwk bener",
  "lol",
  "anjir bener",
  "waduh",
  "asik",
  "gokil",
  "serius?",
  "beneran?",
  "oh gitu",
  "ah masa",
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
  "😎",
  "🤔",
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

/**
 * Extract a meaningful fragment from the payload content.
 * Returns 3-8 words to make the warm-up contextually relevant.
 */
function extractFragment(content: string, minWords = 3, maxWords = 8): string {
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < minWords) return content;

  const len = Math.min(randomInt(minWords, maxWords), words.length);
  const start = randomInt(0, Math.max(0, words.length - len));
  return words.slice(start, start + len).join(" ");
}

/**
 * Build a multi-sentence message by combining 2-3 parts.
 */
function buildMultiSentence(parts: string[]): string {
  const separators = [". ", ", ", "\n", " — ", " "];
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result += pick(separators) + parts[i];
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Generate a single warm-up message that looks organic.
 * Mixes in fragments of the real content to make the
 * conversation contextually related. Varies between
 * short (1 sentence) and long (2-3 sentences).
 */
export function generateWarmupMessage(baseContent?: string): string {
  const strategy = randomInt(1, 8);

  switch (strategy) {
    case 1:
      // Greeting + casual question
      return maybeEmoji(
        maybeLowercase(`${pick(GREETINGS)}, ${pick(CASUAL_QUESTIONS)}`),
      );

    case 2:
      // Simple acknowledgment + follow-up (2 sentences)
      return maybeEmoji(
        maybeLowercase(`${pick(ACKNOWLEDGMENTS)}. ${pick(FOLLOW_UPS)}`),
      );

    case 3:
      // Filler + payload fragment + follow-up (2-3 sentences)
      if (baseContent && baseContent.length > 10) {
        const fragment = extractFragment(baseContent);
        const parts = [
          `${pick(FILLERS)}, ${maybeTypo(fragment)}`,
          pick(FOLLOW_UPS),
        ];
        if (Math.random() > 0.5) {
          parts.push(pick(REACTIONS));
        }
        return maybeLowercase(buildMultiSentence(parts));
      }
      return maybeEmoji(
        maybeLowercase(`${pick(FILLERS)}, ${pick(CASUAL_QUESTIONS)}`),
      );

    case 4:
      // Greeting + payload reference + question (long message)
      if (baseContent && baseContent.length > 10) {
        const fragment = extractFragment(baseContent, 4, 10);
        return maybeLowercase(
          buildMultiSentence([
            `${pick(GREETINGS)}`,
            `soal "${maybeTypo(fragment)}" itu ${pick(FOLLOW_UPS)}`,
          ]),
        );
      }
      return maybeEmoji(maybeLowercase(pick(GREETINGS)));

    case 5:
      // Reaction + acknowledgment + follow-up (multi-sentence)
      return maybeLowercase(
        maybeEmoji(
          buildMultiSentence([
            pick(REACTIONS),
            pick(ACKNOWLEDGMENTS),
            pick(FOLLOW_UPS),
          ]),
        ),
      );

    case 6:
      // Payload paraphrase — rephrase a chunk of the content
      if (baseContent && baseContent.length > 15) {
        const fragment = extractFragment(baseContent, 5, 12);
        const openers = [
          "jadi soal",
          "mengenai",
          "tentang",
          "ngomongin",
          "balik lagi ke",
          "gw mau tanya soal",
        ];
        return maybeLowercase(
          maybeEmoji(
            buildMultiSentence([
              `${pick(openers)} ${maybeTypo(fragment)}`,
              pick(FOLLOW_UPS),
            ]),
          ),
        );
      }
      return maybeLowercase(`${pick(ACKNOWLEDGMENTS)} ${pick(FILLERS)}`);

    case 7:
      // Short acknowledgment (keep some messages simple)
      return maybeEmoji(maybeTypo(maybeLowercase(pick(ACKNOWLEDGMENTS))));

    case 8:
    default:
      // Long conversational — greeting + filler + question (3 parts)
      return maybeLowercase(
        maybeEmoji(
          buildMultiSentence([
            `${pick(GREETINGS)} ${pick(GREETINGS)}`,
            pick(FILLERS),
            pick(CASUAL_QUESTIONS),
          ]),
        ),
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
