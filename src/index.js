// import 'promise-polyfill';
// import 'isomorphic-fetch';
import { h, render } from 'preact'
import './style'

let root
function init () {
  let App = require('./components/app').default
  root = render(<App />, document.body, root)
}

// register ServiceWorker via OfflinePlugin, for prod only:
if (process.env.NODE_ENV === 'production') {
  require('./pwa')
}

// in development, set up HMR:
if (module.hot) {
	// require('preact/devtools');   // turn this on if you want to enable React DevTools!
  module.hot.accept('./components/app', () => requestAnimationFrame(init))
}

init()
