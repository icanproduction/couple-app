export type PetType = 'cat' | 'dog'
export type PetMood = 'thriving' | 'happy' | 'neutral' | 'lonely' | 'sad'
export type CareAction = 'feed' | 'play' | 'bath' | 'treat' | 'walk' | 'cuddle'

export const ALL_CARE_ACTIONS: CareAction[] = ['feed', 'play', 'bath', 'treat', 'walk', 'cuddle']

export const CARE_ACTION_META: Record<CareAction, {
  label: string
  icon: string  // Lucide icon name
  stat: 'hunger' | 'happiness' | 'cleanliness'
  restoreAmount: number
  cooldownMinutes: number
}> = {
  feed:   { label: 'Feed',          icon: 'UtensilsCrossed', stat: 'hunger',      restoreAmount: 40, cooldownMinutes: 240 },
  play:   { label: 'Play',          icon: 'Gamepad2',        stat: 'happiness',   restoreAmount: 30, cooldownMinutes: 120 },
  bath:   { label: 'Give a bath',   icon: 'Droplets',        stat: 'cleanliness', restoreAmount: 50, cooldownMinutes: 360 },
  treat:  { label: 'Give a treat',  icon: 'Cookie',          stat: 'hunger',      restoreAmount: 15, cooldownMinutes: 60 },
  walk:   { label: 'Go for a walk', icon: 'Footprints',      stat: 'happiness',   restoreAmount: 15, cooldownMinutes: 60 },
  cuddle: { label: 'Cuddle',        icon: 'Heart',           stat: 'happiness',   restoreAmount: 15, cooldownMinutes: 60 },
}

export const MOOD_META: Record<PetMood, {
  label: string
  description: string
  color: string
  bgColor: string
}> = {
  thriving: { label: 'Thriving', description: 'On top of the world. You two make a great team.',               color: '#3A9E5A', bgColor: '#E0F5EC' },
  happy:    { label: 'Happy',    description: 'Happy and well looked after.',                                  color: '#C09020', bgColor: '#FFF8DC' },
  neutral:  { label: 'Neutral',  description: 'Doing okay, but something needs attention.',                    color: '#807060', bgColor: '#F0E8E0' },
  lonely:   { label: 'Lonely',   description: 'Feeling lonely... and could use some attention from you two.',  color: '#C06030', bgColor: '#FFF0E0' },
  sad:      { label: 'Sad',      description: 'Sad after going too long without care.',                        color: '#5070A0', bgColor: '#E0EEFF' },
}

export interface CouplePet {
  id: string
  couple_id: string
  pet_type: PetType
  name: string
  level: number
  xp: number
  created_at: string
}

export interface PetMoodState {
  id: string
  pet_id: string
  mood: PetMood
  hunger: number
  happiness: number
  cleanliness: number
  thriving_since: string | null
  updated_at: string
}

export interface PetCareRole {
  id: string
  couple_id: string
  pet_id: string
  profile_id: string
  actions: CareAction[]
}

export interface PetCareLog {
  id: string
  pet_id: string
  action_type: CareAction
  done_by: string
  done_at: string
}

export interface PetWithMood extends CouplePet {
  mood_state: PetMoodState
}
