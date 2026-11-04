import { Skeleton } from '@/components/ui/Skeleton'

export default function PetLoading() {
  return (
    <div className="animate-fade-in pb-6" aria-busy="true">
      <div className="flex items-center gap-2 border-b border-border bg-white px-4 pb-3 pt-4">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <div className="space-y-4 px-4 pt-4">
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-[300px] w-full rounded-3xl" />
        <Skeleton className="mx-auto h-4 w-48" />
        <div className="grid grid-cols-3 gap-2.5">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  )
}
