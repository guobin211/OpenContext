export function Skeleton({ className, ...props }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      {...props}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="w-full flex-1 max-w-[900px] mx-auto pt-16 px-12 overflow-y-auto">
      {/* Title Skeleton */}
      <Skeleton className="h-12 w-3/4 mb-8" />
      
      {/* Content Skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>

      <div className="space-y-4 mt-8">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      
      {/* Image/Block placeholder */}
      <Skeleton className="h-48 w-full mt-8 rounded-lg" />
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-5 w-5 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-2 pl-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

