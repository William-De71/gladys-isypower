// -----------------------------------------------------------------------------
// Calendar dates.
//
// A forecast of Bison Futé is a calendar date ("2026-10-23"), the day of
// mainland France: "today" is read in the timezone of the Gladys instance,
// which the supervisor injects as TZ (Paris time for nearly every user).
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date and time of an instant in a timezone.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 * @example
 * localClock(Date.parse('2026-10-16T12:00:00Z'), 'Europe/Paris'); // 2026-10-16, 840
 */
function localClock(instant, timeZone = defaultTimeZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description Shift a calendar date by a number of days.
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} days - Days to add (negative to go back).
 * @returns {string} `YYYY-MM-DD`.
 */
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @description The instant of a local wall-clock time in a timezone.
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} minutes - Minutes after midnight.
 * @param {string} timeZone - IANA timezone.
 * @returns {number} The instant, in ms.
 */
function zonedInstant(date, minutes, timeZone) {
  const wanted = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE_MS;
  let guess = wanted;
  // Two passes settle the offset, DST changes included.
  for (let pass = 0; pass < 2; pass += 1) {
    const clock = localClock(guess, timeZone);
    const seen = Date.parse(`${clock.date}T00:00:00Z`) + clock.minutes * MINUTE_MS;
    guess += wanted - seen;
  }
  return guess;
}

/**
 * @description The next local midnight (a little after), when "today" and
 * "tomorrow" move.
 * @param {number} now - Now, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {number} The instant, in ms.
 */
function nextMidnight(now, timeZone = defaultTimeZone()) {
  const tomorrow = addDays(localClock(now, timeZone).date, 1);
  return zonedInstant(tomorrow, 1, timeZone);
}

/**
 * @description A calendar date for a widget card. Gladys shows a date of
 * that exact form as the calendar day itself, without a time, in every
 * timezone (front 5.1.1+).
 * @param {string} date - `YYYY-MM-DD`.
 * @returns {string} ISO 8601 date.
 */
const displayInstant = (date) => `${date}T00:00:00.000Z`;

export {
  DAY_MS,
  MINUTE_MS,
  defaultTimeZone,
  localClock,
  addDays,
  zonedInstant,
  nextMidnight,
  displayInstant,
};
