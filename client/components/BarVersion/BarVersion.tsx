import truncate from 'truncate'

interface Props {
  version: string
}

export function BarVersion({ version }: Props) {
  return (
    <div className="bar-graph__bar-version">
      <div>
        <span title={version}>{truncate(version, 7)}</span>
      </div>
    </div>
  )
}
