// ─── Carrier Helpers ─────────────────────────────────────────────
// Classify an Indonesian destination number by prefix and parse the
// Rupiah amount out of a USSD balance string.
//
// NOTE: prefix → carrier is approximate — number portability (MNP)
// means a ported number may bill at a different carrier's tariff than
// its prefix suggests. Treat the result as a heuristic.
// ─────────────────────────────────────────────────────────────────

export type Carrier =
  | "telkomsel"
  | "indosat"
  | "xl"
  | "axis"
  | "tri"
  | "smartfren"
  | "unknown";

const PREFIX_MAP: Record<string, Carrier> = {};
const register = (carrier: Carrier, prefixes: string[]) =>
  prefixes.forEach((p) => (PREFIX_MAP[p] = carrier));

register("telkomsel", ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"]);
register("indosat", ["0814", "0815", "0816", "0855", "0856", "0857", "0858"]);
register("xl", ["0817", "0818", "0819", "0859", "0877", "0878"]);
register("axis", ["0831", "0832", "0833", "0838"]);
register("tri", ["0895", "0896", "0897", "0898", "0899"]);
register("smartfren", ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"]);

// Numbers are stored as 62xxxxxxxxxx; normalise to a leading-0 prefix.
export function detectCarrier(number: string): Carrier {
  const digits = number.replace(/\D/g, "");
  const national = digits.startsWith("62") ? "0" + digits.slice(2) : digits;
  return PREFIX_MAP[national.slice(0, 4)] ?? "unknown";
}

// "Rp25.000" / "Rp 25.000,50" → 25000 (integer Rupiah, decimals dropped).
export function parseRupiah(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/rp\s*([\d.]+)/i) ?? text.match(/([\d.]+)/);
  if (!match) return null;
  const value = parseInt(match[1].replace(/\./g, ""), 10);
  return Number.isFinite(value) ? value : null;
}
