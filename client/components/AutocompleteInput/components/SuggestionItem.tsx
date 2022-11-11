import cx from 'classnames'

interface SuggestionItemProps {
  item: {
    highlight: string | null
    package: {
      name: string
      description: string
    }
  }
  isHighlighted: boolean
}

export function SuggestionItem({ item, isHighlighted }: SuggestionItemProps) {
  return (
    <div
      key={item.package.name}
      className={cx('autocomplete-input__suggestion', {
        'autocomplete-input__suggestion--highlight': isHighlighted,
      })}
    >
      {item.highlight != null ? (
        <div dangerouslySetInnerHTML={{ __html: item.highlight }} />
      ) : (
        <div>{item.package.name}</div>
      )}

      <div className="autocomplete-input__suggestion-description">
        {item.package.description}
      </div>
    </div>
  )
}
