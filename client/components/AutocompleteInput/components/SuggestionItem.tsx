import cx from 'classnames'

interface SuggestionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  item: {
    highlight?: string
    package: {
      name: string
      description: string
    }
  }
  isHighlighted: boolean
}

export function SuggestionItem({
  item,
  isHighlighted,
  ...props
}: SuggestionItemProps) {
  return (
    <div
      {...props}
      key={item.package.name}
      className={cx('autocomplete-input__suggestion', {
        'autocomplete-input__suggestion--highlight': isHighlighted,
      })}
      role="option"
      aria-selected={isHighlighted}
    >
      {item.highlight != null ? (
        <div
          key="highlight"
          dangerouslySetInnerHTML={{ __html: item.highlight }}
        />
      ) : (
        <div key="name">{item.package.name}</div>
      )}

      <div
        key="description"
        className="autocomplete-input__suggestion-description"
      >
        {item.package.description}
      </div>
    </div>
  )
}
