interface Props {
  version: string
}

export function BarVersion({ version }: Props) {
  return (
    <div className="bar-graph__bar-version">
      <div>
        <span title={version}>{version}</span>
      </div>
    </div>
  )
}
