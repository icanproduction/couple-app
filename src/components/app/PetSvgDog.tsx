'use client'

import PetFigure, { type PetFigureProps } from '@/components/pet/PetFigure'

/** The dog: pose (glowing, cozy, dozy, comfort, night, box, peek, celebrate), stage and gestures. */
export default function PetSvgDog(props: Omit<PetFigureProps, 'type'>) {
  return <PetFigure type="dog" {...props} />
}
