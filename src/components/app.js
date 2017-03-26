import { h, Component } from 'preact';
import { Router } from 'preact-router';

import Home from './home';
import style from './app.less'

export default class App extends Component {
  /** Gets fired when the route changes.
   *  @param {Object} event    "change" event from [preact-router](http://git.io/preact-router)
   *  @param {string} event.url  The newly routed URL
   */
  handleRoute = e => {
    this.currentUrl = e.url;
  };

  render() {
    return (
      <div id="app">
        <Router onChange={this.handleRoute}>
          <Home path="/" />
        </Router>
        <footer className={ style.footer }>
          <div className={ style.thread} />
          <p>
            Made with
            <svg
              style={{ width: '14px', height: '14px', margin: '0 8px' }}
              width="428"
              height="364"
              viewBox="0 0 428 364"
              xmlns="http://www.w3.org/2000/svg">
              <path d="M402.788,43.476 C339.296,-38.956 214.342,9.684 214.342,93.396 C214.342,9.684 89.38,-38.96 25.879,43.476 C-18.9906262,101.740198 -2.94848962,189.949161 72.215244,267.328526 C106.99216,303.130575 154.425516,336.61428 214.338,363.741 C403.731,277.985 468.418,128.698 402.788,43.476 Z"
                    id="Shape"
                    fill="#F05228"
                    fill-rule="evenodd" />
            </svg>

            by &nbsp;
            <a href="https://github.com/pastelsky">
              @pastelsky
            </a>
          </p>
          <p>
            <a className="github-button" href="https://github.com/pastelsky/npm-cost" data-style="mega" aria-label="Star pastelsky/npm-cost on GitHub">Fork on Github</a>
          </p>
        </footer>
      </div>
    );
  }
}
