import React, {Component} from 'react';
import stylesheet from './QuickStatsBar.scss'

import TreeShakeIcon from '../../assets/tree-shake.svg'
import SideEffectIcon from '../../assets/side-effect.svg'
import DependencyIcon from '../../assets/dependency.svg'
import GithubIcon from '../../assets/github-logo.svg'
import NPMIcon from '../../assets/npm-logo.svg'
import InfoIcon from '../../assets/info.svg'

class QuickStatsBar extends Component {
  static defaultProps = {
    description: ''
  }

  getStatItemCount = () => {
    const { isTreeShakeable, hasSideEffects } = this.props
    let statItemCount = 0

    if (isTreeShakeable) statItemCount += 1;
    if (!hasSideEffects) statItemCount += 1;
    return statItemCount
  }

  getTrimmedDescription = () => {
    const { description } = this.props
    if (description.trim().endsWith('.')) {
      return description.substring(0, description.length - 1);
    } else {
      return description.trim()
    }
  }

  render() {
    const { isTreeShakeable, hasSideEffects, dependencyCount, name, repository } = this.props
    const statItemCount = this.getStatItemCount()

    return (
      <div className="quick-stats-bar">
        <style dangerouslySetInnerHTML={{ __html: stylesheet }}/>

        {/* Obvious target for XSS :\ */}
        {statItemCount < 2 && (
          <div
            className="quick-stats-bar__stat quick-stats-bar__stat--description "
            title={ this.getTrimmedDescription() }
          >
            <InfoIcon className="quick-stats-bar__stat-icon"/>
            <span
              dangerouslySetInnerHTML={{ __html: this.getTrimmedDescription() }}
              style={{
                maxWidth: `${500 - statItemCount * 280}px`
              }}
            />
          </div>
        )}

        {isTreeShakeable && (
          <div className="quick-stats-bar__stat">
            <TreeShakeIcon className="quick-stats-bar__stat-icon"/> <span>tree-shakeable</span>
          </div>
        )}

        {!hasSideEffects && (
          <div className="quick-stats-bar__stat">
            <SideEffectIcon className="quick-stats-bar__stat-icon"/> <span>side-effect free</span>
          </div>
        )}
        <div className="quick-stats-bar__stat quick-stats-bar__stat--optional">
          <DependencyIcon className="quick-stats-bar__stat-icon"/>
          <span>
            {dependencyCount === 0 ? 'no dependencies' : (
              <span>{dependencyCount} {dependencyCount > 1 ? 'dependencies' : 'dependency'}</span>
            )}
          </span>
        </div>
        <div className="quick-stats-bar__stat">
          <a
            className="quick-stats-bar__link"
            href={'https://npmjs.org/package/' + name}
            target="_blank"
            rel="noopener noreferrer"
          >
            <NPMIcon className="quick-stats-bar__logo-icon quick-stats-bar__logo-icon--npm"/>
          </a>
          <a
            className="quick-stats-bar__link"
            href={repository}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon
              className="quick-stats-bar__logo-icon quick-stats-bar__logo-icon quick-stats-bar__logo-icon--github"/>
          </a>
        </div>
      </div>
    );
  }
}

export default QuickStatsBar;