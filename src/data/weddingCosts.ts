export interface WeddingEstimate {
  city: string
  scales: {
    intimate: { guests: number; low: number; high: number }
    medium: { guests: number; low: number; high: number }
    large: { guests: number; low: number; high: number }
  }
}

// Estimates in IDR, based on 2024-2025 Indonesian wedding market research
export const WEDDING_COSTS: WeddingEstimate[] = [
  {
    city: 'Jakarta',
    scales: {
      intimate: { guests: 50, low: 40_000_000, high: 80_000_000 },
      medium: { guests: 150, low: 80_000_000, high: 180_000_000 },
      large: { guests: 300, low: 150_000_000, high: 400_000_000 },
    },
  },
  {
    city: 'Bandung',
    scales: {
      intimate: { guests: 50, low: 30_000_000, high: 60_000_000 },
      medium: { guests: 150, low: 60_000_000, high: 140_000_000 },
      large: { guests: 300, low: 120_000_000, high: 300_000_000 },
    },
  },
  {
    city: 'Surabaya',
    scales: {
      intimate: { guests: 50, low: 30_000_000, high: 65_000_000 },
      medium: { guests: 150, low: 65_000_000, high: 150_000_000 },
      large: { guests: 300, low: 130_000_000, high: 350_000_000 },
    },
  },
  {
    city: 'Yogyakarta',
    scales: {
      intimate: { guests: 50, low: 25_000_000, high: 50_000_000 },
      medium: { guests: 150, low: 50_000_000, high: 120_000_000 },
      large: { guests: 300, low: 100_000_000, high: 250_000_000 },
    },
  },
  {
    city: 'Bali',
    scales: {
      intimate: { guests: 50, low: 50_000_000, high: 120_000_000 },
      medium: { guests: 150, low: 100_000_000, high: 250_000_000 },
      large: { guests: 300, low: 200_000_000, high: 500_000_000 },
    },
  },
  {
    city: 'Other cities',
    scales: {
      intimate: { guests: 50, low: 20_000_000, high: 50_000_000 },
      medium: { guests: 150, low: 45_000_000, high: 120_000_000 },
      large: { guests: 300, low: 90_000_000, high: 250_000_000 },
    },
  },
]

export type WeddingScale = 'intimate' | 'medium' | 'large'

export const SCALE_LABELS: Record<WeddingScale, { label: string; desc: string }> = {
  intimate: { label: 'Intimate', desc: '~50 guests, close and cozy' },
  medium: { label: 'Medium', desc: '~150 guests, family and close friends' },
  large: { label: 'Large', desc: '300+ guests, big and festive' },
}

export function getEstimate(city: string, scale: WeddingScale) {
  const data = WEDDING_COSTS.find(c => c.city === city) ?? WEDDING_COSTS[WEDDING_COSTS.length - 1]
  const range = data.scales[scale]
  const midpoint = Math.round((range.low + range.high) / 2)
  return { ...range, midpoint }
}
