// Truth or Dare game rules, as pure functions over a plain state object.
// No runtime imports, so scripts/verify/game-truth-or-dare.mjs exercises the
// same code the page runs. Every function returns the state unchanged when a
// move isn't allowed (a double tap, a stale button), so the UI can call them
// freely.
//
// Rules: players alternate turns. On a turn you pick Truth, Dare or Random,
// get a card, then mark it Done (+1 point) or Skip it (3 skips per player per
// game). One Swap per turn trades the card for another of the same kind.
// Within a heat and kind no card repeats until all of them have been drawn,
// then that pile reshuffles. A game lasts `turnsEach` turns per player, or
// until someone ends it.

import type { TodCard, TodHeat, TodKind } from './deck'

export interface PlayCard extends TodCard {
  /** Written by the couple (truth_or_dare_cards), not from the built-in deck. */
  custom: boolean
  authorId: string | null
}

export interface TodGame {
  v: 1
  /** Player ids in turn order: players[0] goes first. */
  players: [string, string]
  turnsEach: number
  heat: TodHeat
  /** Turns finished so far (Done or Skip). */
  turn: number
  points: Record<string, number>
  skipsUsed: Record<string, number>
  /** Card ids drawn in the current cycle, per heat and kind ("sweet:truth"). */
  seen: Record<string, string[]>
  current: { cardId: string; kind: TodKind; swapped: boolean } | null
  truthsDone: number
  daresDone: number
  skipped: number
  ended: boolean
}

export const SKIPS_PER_PLAYER = 3
export const TURN_CHOICES = [5, 10, 15] as const
export const DEFAULT_TURNS = 10

/** Same limits as the truth_or_dare_cards CHECK and cap trigger. */
export const CUSTOM_BODY_MAX = 200
export const CUSTOM_CARDS_MAX = 300

/** The problem with a draft custom card, or null when it can be saved. */
export function customBodyError(body: string): string | null {
  const text = body.trim()
  if (!text) return 'Write something first.'
  if (text.length > CUSTOM_BODY_MAX) return `Keep it to ${CUSTOM_BODY_MAX} characters or fewer.`
  return null
}

export type Rng = () => number

export function poolKey(heat: TodHeat, kind: TodKind): string {
  return heat + ':' + kind
}

export function newGame(players: [string, string], heat: TodHeat, turnsEach: number, seen: Record<string, string[]> = {}): TodGame {
  return {
    v: 1,
    players,
    turnsEach,
    heat,
    turn: 0,
    points: { [players[0]]: 0, [players[1]]: 0 },
    skipsUsed: { [players[0]]: 0, [players[1]]: 0 },
    seen,
    current: null,
    truthsDone: 0,
    daresDone: 0,
    skipped: 0,
    ended: false,
  }
}

export function totalTurns(g: TodGame): number {
  return g.turnsEach * 2
}

export function isOver(g: TodGame): boolean {
  return g.ended || g.turn >= totalTurns(g)
}

export function currentPlayer(g: TodGame): string {
  return g.players[g.turn % 2]
}

export function skipsLeft(g: TodGame, playerId: string): number {
  return Math.max(0, SKIPS_PER_PLAYER - (g.skipsUsed[playerId] ?? 0))
}

export function findCard(cards: readonly PlayCard[], id: string | undefined): PlayCard | null {
  if (!id) return null
  return cards.find((c) => c.id === id) ?? null
}

/** Pick an unseen card of this heat and kind; reshuffles the pile once it runs out. */
function pick(g: TodGame, cards: readonly PlayCard[], kind: TodKind, rng: Rng, avoidId: string | null) {
  const key = poolKey(g.heat, kind)
  const pile = cards.filter((c) => c.heat === g.heat && c.kind === kind)
  if (pile.length === 0) return null
  const inPile = new Set(pile.map((c) => c.id))
  let seen = (g.seen[key] ?? []).filter((id) => inPile.has(id))
  let candidates = pile.filter((c) => !seen.includes(c.id))
  let reshuffled = false
  if (candidates.length === 0) {
    reshuffled = true
    seen = []
    candidates = pile.filter((c) => c.id !== avoidId)
    if (candidates.length === 0) candidates = pile
  }
  const card = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
  return { card, seen: { ...g.seen, [key]: [...seen, card.id] }, reshuffled }
}

export interface DrawResult {
  game: TodGame
  card: PlayCard | null
  /** The pile ran out and was shuffled back in for this draw. */
  reshuffled: boolean
}

/** Start the current player's card. Only when no card is showing. */
export function drawCard(g: TodGame, cards: readonly PlayCard[], kind: TodKind, rng: Rng = Math.random): DrawResult {
  if (isOver(g) || g.current) return { game: g, card: null, reshuffled: false }
  const last = g.seen[poolKey(g.heat, kind)]?.slice(-1)[0] ?? null
  const picked = pick(g, cards, kind, rng, last)
  if (!picked) return { game: g, card: null, reshuffled: false }
  return {
    game: { ...g, seen: picked.seen, current: { cardId: picked.card.id, kind, swapped: false } },
    card: picked.card,
    reshuffled: picked.reshuffled,
  }
}

/** Trade the showing card for another of the same kind, once per turn. */
export function swapCard(g: TodGame, cards: readonly PlayCard[], rng: Rng = Math.random): DrawResult {
  if (isOver(g) || !g.current || g.current.swapped) return { game: g, card: null, reshuffled: false }
  const picked = pick(g, cards, g.current.kind, rng, g.current.cardId)
  if (!picked) return { game: g, card: null, reshuffled: false }
  return {
    game: { ...g, seen: picked.seen, current: { cardId: picked.card.id, kind: g.current.kind, swapped: true } },
    card: picked.card,
    reshuffled: picked.reshuffled,
  }
}

export function canSkip(g: TodGame): boolean {
  return !!g.current && !isOver(g) && skipsLeft(g, currentPlayer(g)) > 0
}

/** Close the turn: Done scores a point, Skip spends one of the player's skips. */
export function finishTurn(g: TodGame, outcome: 'done' | 'skip'): TodGame {
  if (!g.current || isOver(g)) return g
  const player = currentPlayer(g)
  if (outcome === 'skip') {
    if (!canSkip(g)) return g
    return {
      ...g,
      current: null,
      turn: g.turn + 1,
      skipped: g.skipped + 1,
      skipsUsed: { ...g.skipsUsed, [player]: (g.skipsUsed[player] ?? 0) + 1 },
    }
  }
  return {
    ...g,
    current: null,
    turn: g.turn + 1,
    points: { ...g.points, [player]: (g.points[player] ?? 0) + 1 },
    truthsDone: g.truthsDone + (g.current.kind === 'truth' ? 1 : 0),
    daresDone: g.daresDone + (g.current.kind === 'dare' ? 1 : 0),
  }
}

/** Change the heat for the coming cards. Not while a card is showing. */
export function setHeat(g: TodGame, heat: TodHeat): TodGame {
  if (g.current || isOver(g) || g.heat === heat) return g
  return { ...g, heat }
}

export function endGame(g: TodGame): TodGame {
  return g.ended ? g : { ...g, ended: true, current: null }
}

/**
 * A fresh game with the same players and length. The other player starts
 * this time, and cards already drawn stay drawn, so the next game doesn't
 * repeat them either.
 */
export function playAgain(g: TodGame): TodGame {
  return newGame([g.players[1], g.players[0]], g.heat, g.turnsEach, g.seen)
}

/** The winner's id, or null for a tie. */
export function leader(g: TodGame): string | null {
  const [a, b] = g.players
  const pa = g.points[a] ?? 0
  const pb = g.points[b] ?? 0
  if (pa === pb) return null
  return pa > pb ? a : b
}

/**
 * A saved game read back from sessionStorage, or null when it doesn't fit
 * this couple any more (other players, broken shape). A card that was
 * deleted meanwhile is dropped so the turn starts over.
 */
export function restoreGame(raw: unknown, playerIds: readonly string[], cards: readonly PlayCard[]): TodGame | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Partial<TodGame>
  const ids = new Set(playerIds)
  const heats: readonly string[] = ['sweet', 'playful', 'brave']
  if (g.v !== 1 || !Array.isArray(g.players) || g.players.length !== 2) return null
  if (!g.players.every((p) => typeof p === 'string' && ids.has(p)) || g.players[0] === g.players[1]) return null
  if (typeof g.heat !== 'string' || !heats.includes(g.heat)) return null
  const ints = [g.turnsEach, g.turn, g.truthsDone, g.daresDone, g.skipped]
  if (!ints.every((n) => Number.isInteger(n) && (n as number) >= 0)) return null
  if (!g.points || !g.skipsUsed || !g.seen || typeof g.ended !== 'boolean') return null
  const game = g as TodGame
  if (game.turnsEach < 1 || game.turnsEach > 50) return null
  for (const p of game.players) {
    if (!Number.isInteger(game.points[p]) || !Number.isInteger(game.skipsUsed[p])) return null
  }
  if (typeof game.seen !== 'object' || Array.isArray(game.seen)) return null
  for (const ids of Object.values(game.seen)) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null
  }
  if (game.current) {
    const card = findCard(cards, game.current.cardId)
    if (!card || card.kind !== game.current.kind || typeof game.current.swapped !== 'boolean') return { ...game, current: null }
  }
  return game
}
