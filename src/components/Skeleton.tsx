'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function TableRowSkeleton({ columns = 8 }: { columns?: number }) {
  return (
    <tr>
      <td className="px-2 py-2.5"><Skeleton className="h-4 w-6" /></td>
      <td className="px-3 py-2.5"><Skeleton className="h-4 w-4" /></td>
      <td className="px-2 py-2.5"><Skeleton className="h-4 w-4" /></td>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Skeleton className={`h-4 ${i === 0 ? 'w-20' : i === 1 ? 'w-32' : 'w-16'}`} />
        </td>
      ))}
      <td className="px-3 py-2.5"><Skeleton className="h-4 w-4" /></td>
    </tr>
  );
}

export function TableSkeleton({ rows = 10, columns = 8 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[var(--bg-tertiary)]">
          <tr>
            {Array.from({ length: columns + 3 }).map((_, i) => (
              <th key={i} className="px-3 py-3">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
