import { DAYS_PER_YEAR, HOURS_PER_TICK } from "./types";
import { astronomy, PLANET } from "./planet";

export interface WorldClock {
  elapsedSeconds: number;
  elapsedDays: number;
  tickSeconds: number;
  year: number;
  dayOfYear: number;
  daysInYear: number;
  universalTime: string;
  localSolarTime: string;
  planetAge: { yearsAtEpoch: number; secondsSinceEpoch: number };
}
const time = (seconds: number) => {
  const day = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  return [Math.floor(day / 3600), Math.floor(day / 60) % 60, day % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};
/** An observer's calendar; societies are not required to adopt its year or epoch. */
export function worldClock(tick: number, x = 0, y = 0): WorldClock {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new Error("World time must be a non-negative integer tick.");
  const elapsedSeconds = tick * HOURS_PER_TICK * 3600,
    day = Math.floor(elapsedSeconds / 86400);
  let completedYears = Math.floor(day / DAYS_PER_YEAR);
  while (day >= Math.floor((completedYears + 1) * DAYS_PER_YEAR))
    completedYears++;
  const start = Math.floor(completedYears * DAYS_PER_YEAR);
  return {
    elapsedSeconds,
    elapsedDays: elapsedSeconds / 86400,
    tickSeconds: HOURS_PER_TICK * 3600,
    year: completedYears + 1,
    dayOfYear: day - start + 1,
    daysInYear: Math.floor((completedYears + 1) * DAYS_PER_YEAR) - start,
    universalTime: time(elapsedSeconds),
    localSolarTime: time(astronomy(tick, x, y).localHour * 3600),
    // Keep the enormous geological age separate from fine elapsed time, avoiding lost precision.
    planetAge: {
      yearsAtEpoch: PLANET.ageYears,
      secondsSinceEpoch: elapsedSeconds,
    },
  };
}
