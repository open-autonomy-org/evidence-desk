// The time Evidence Desk records and reads by. Inside a volter World the World's clock is the one "now" every service
// agrees on (the twins stamp from it), so a record made there carries the World's instant, not the host's; the World
// names its clock file in TWIN_WORLD_CLOCK_FILE. Anywhere else it is the wall clock. A clock file that cannot be read as
// an instant is an error, never a silent fall back to the wall clock.
import { existsSync, readFileSync } from 'node:fs';

export function clockDate(): Date {
  const file = process.env.TWIN_WORLD_CLOCK_FILE;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim();
    const at = Date.parse(raw);
    if (Number.isNaN(at)) throw new Error(`the World clock ${file} does not hold an ISO-8601 instant`);
    return new Date(at);
  }
  return new Date();
}
export const now = () => clockDate().toISOString().replace(/\.\d{3}Z$/, 'Z');
