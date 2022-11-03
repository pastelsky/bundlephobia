interface Props {
  version: string
}

export function BarVersion({ version }: Props) {
  return (
    <div className="bar-graph__bar-version">
      <div>
        <span>{version}</span>
      </div>
    </div>
  )
}
