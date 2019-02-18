import React, { Component } from 'react'
import Link from 'next/link'
import Analytics from 'react-ga'
import API from '../../api'
import stylesheet from './Layout.scss'

import Heart from '../../../assets/heart.svg'

const OutboundLink = Analytics.OutboundLink
export default class Layout extends Component {
  state = {
    recentSearches: [],
  }

  componentDidMount() {
    API.getRecentSearches(5)
      .then(searches => {
        this.setState({
          recentSearches: Object.keys(searches),
        })
      })
  }

  render() {
    const { children, className } = this.props
    const { recentSearches } = this.state

    return (
      <section className="layout">
        <style dangerouslySetInnerHTML={ { __html: stylesheet } } />
        <section className={ className }>
          { children }
        </section>

        <footer>
          <div className="footer__recent-search-bar">
            <div className="footer__recent-search-bar__wrap">
              <h4>Recent searches</h4>
              <ul className="footer__recent-search-list">
                {
                  recentSearches.map(
                    search => (
                      <li key={ search }>
                        <Link href={ `/result?p=${search}` }>
                          <a>
                            { search }
                          </a>
                        </Link>
                      </li>
                    ))
                }
              </ul>
            </div>
          </div>
          <section className="footer__split">
            <div className="footer__description">
              <h3> What does this thing do? </h3>
              <p>
                JavaScript bloat is more real today than it ever was.
                Sites continuously get bigger as more (often
                redundant) libraries are thrown to
                solve new problems. Until of-course, the <i> big rewrite </i>
                happens.
              </p>
              <p>
                This thing lets you understand the performance cost of
                <code>npm&nbsp;install</code> ing
                a new npm package before actually adding it to your bundle.
              </p>
              <p>
                Credits to <a href="https://twitter.com/thekitze" target="_blank"> @thekitze </a>
                for suggesting the name.
              </p>
            </div>
            <div className="footer__credits">
              <Heart className="footer__credits__heart" />️
              <OutboundLink
                className="footer__credits-profile"
                eventLabel="Footer Profile Click"
                target="_blank"
                to="https://github.com/pastelsky"
              >
                @pastelsky
              </OutboundLink>

              <OutboundLink
                eventLabel="Footer Repo Click"
                target="_blank"
                to="https://github.com/pastelsky/bundlephobia"
              >
                <button className="footer__credits-fork-button">
                  Star on GitHub
                </button>
              </OutboundLink>
            </div>
          </section>
        </footer>
      </section>
    )
  }
}