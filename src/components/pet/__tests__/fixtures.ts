import type { RoomData } from '../api'

/** Same as api.EMPTY_ROOM, without importing the Supabase client into tests. */
export const EMPTY_ROOM_FOR_TESTS: RoomData = {
  jarNotesThisMonth: null,
  latestMoment: null,
  lettersSealed: null,
  bothHiDaysThisMonth: null,
  nextEvent: null,
  mapPins: null,
  gamesThisMonth: null,
}
