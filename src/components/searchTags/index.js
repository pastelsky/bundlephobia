import { h, Component } from 'preact'
import cx from 'classnames'

import style from './style'

export default class SearchTags extends Component {
  state = {
    recents: [],
  }

  componentDidMount() {
    fetch(`/recent?limit=4`)
      .then(result => {
        if (result.ok) {
          result.json()
            .then(json => {
              this.setState({ recents: Object.keys(json) })
            })
            .catch(err => {
              console.error(err)
            })
        }
      })
      .catch(err => {
        console.error(err)
      })
  }

  render() {
    const { recents } = this.state
    const { onSelect } = this.props

    return (
      <div className={ cx(style.searchTagsWrap, { [style.searchTagsWrapVisible]: !!recents.length})  }>
          <h4> Recent searches: </h4>
        <ul className={ style.searchTagsContainer }>
          {
            recents.map(recent => (
              <li
                key={ recent }
                tabIndex="0"
                className={ style.searchTag }
                onClick={ () => onSelect(recent) }
              >
                { recent }
              </li>
            ))
          }
        </ul>
      </div>
    )
  }
}
