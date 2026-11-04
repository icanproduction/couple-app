import { redirect } from 'next/navigation'

// The old mood legend is gone (Pet Kita remake). Old push links still land on
// the pet.
export default function PetMoodRedirect() {
  redirect('/app/pet')
}
