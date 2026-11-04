'use client'

import PetFigure, { type PetFigureProps } from '@/components/pet/PetFigure'

/** The cat: pose (glowing, cozy, dozy, comfort, night, box, peek, celebrate), stage and gestures. */
export default function PetSvgCat(props: Omit<PetFigureProps, 'type'>) {
  return <PetFigure type="cat" {...props} />
}
