import { redirect } from 'next/navigation'

// The old care checklist is gone (Pet Kita remake). Old push links still land
// on the pet.
export default function PetCareRedirect() {
  redirect('/app/pet')
}
