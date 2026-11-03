import {
  Baby, Compass, Gem, Handshake, Heart, HeartHandshake, MessageCircleHeart,
  PartyPopper, Rocket, Sparkles, Sun, TreePine, Wallet, type LucideIcon,
} from 'lucide-react'

// deep_talk_packs.icon_name → icon. Unknown names fall back to the chat heart.
const ICONS: Record<string, LucideIcon> = {
  Baby, Compass, Gem, Handshake, Heart, HeartHandshake, MessageCircleHeart,
  PartyPopper, Rocket, Sparkles, Sun, TreePine, Wallet,
}

export const DEEP_TALK_ICON_NAMES = Object.keys(ICONS)

export default function DeepTalkPackIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || MessageCircleHeart
  return <Icon className={className} aria-hidden />
}
