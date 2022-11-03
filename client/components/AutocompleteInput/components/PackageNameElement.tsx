interface Props extends React.HTMLAttributes<HTMLElement> {
  as?: 'h1'
}

export function PackageNameElement({ as, ...props }: Props) {
  return as === 'h1' ? <h1 {...props} /> : <span {...props} />
}
