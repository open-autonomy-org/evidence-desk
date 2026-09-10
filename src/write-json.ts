// Refuse numeric value loss before standard JSON parsing/reserialization for item writes.
// Compare exact decimal values, not rounded Number equality; strings are skipped as whole tokens.
function decimalValue(token: string): string {
  const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa!.split(".");
  const negative = whole!.startsWith("-");
  const digits = (whole!.replace("-", "") + fraction).replace(/^0+/, "");
  if (!digits) return negative ? "-0" : "0";
  const coefficient = digits.replace(/0+$/, "");
  const scale = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - coefficient.length);
  return `${negative ? "-" : ""}${coefficient}e${scale}`;
}

export function parseWriteJson(text: string, label: string) {
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`${label}: invalid JSON; correct the JSON and retry (${String(error)}).`); }
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    if (token.startsWith('"')) continue;
    const number = Number(token);
    if (!Number.isFinite(number) || decimalValue(token) !== decimalValue(JSON.stringify(number))) {
      throw new Error(`${label}: number ${token} cannot be reserialized without numeric value loss. Nothing committed; use an external precision-preserving editor, or explicitly represent extension data as strings before retrying.`);
    }
  }
  return value;
}
