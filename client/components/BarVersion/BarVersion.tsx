import truncate from 'truncate'

interface Props {
  version: string
}

export function BarVersion({ version }: Props) {
  return (
    <span className="bar-graph__bar-version">
      <span>
        <span title={version}>{truncate(version, 7)}</span>
      </span>
    </span>
  )
}
