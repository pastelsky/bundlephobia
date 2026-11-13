export function LoadingPlaceholder({
  label,
  className = '',
}: {
  label: string
  className?: string
}) {
  return (
    <div
      aria-label={label}
      className={`animate-pulse rounded bg-slate-100 motion-reduce:animate-none ${className}`}
    />
  )
}
