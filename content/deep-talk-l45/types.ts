// Shape of one Deep Talk pack's new levels 4 and 5 (one file per pack, named
// <slug>.ts). The driver turns these files into the migration
// supabase/migrations/20261104090000_deep_talk_levels_4_5.sql.
// Checked by scripts/verify/dt-l45-check.mjs.

export interface DeepTalkL45Question {
  /** The question as shown on the card. English, per docs/COPY-GUIDE.md. */
  text: string
  /** null = either partner answers; 1 or 2 = asked to that partner (alternating turns). */
  target: null | 1 | 2
}

export interface DeepTalkL45Level {
  level: 4 | 5
  /** Short level name, 2-28 characters. */
  title: string
  /** One line under the title, 10-70 characters. */
  description: string
  /** Exactly 6. */
  questions: DeepTalkL45Question[]
}

export interface DeepTalkL45Pack {
  slug: string
  levels: [DeepTalkL45Level, DeepTalkL45Level]
}
