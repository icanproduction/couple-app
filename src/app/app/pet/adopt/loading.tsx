import { Skeleton } from '@/components/ui/Skeleton'

export default function AdoptLoading() {
  return (
    <div className="animate-fade-in pb-6" aria-busy="true">
      <div className="border-b border-border bg-white px-4 pb-4 pt-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-5 px-4 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-52 rounded-3xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  )
}
