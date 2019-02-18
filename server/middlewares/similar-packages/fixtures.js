const Weight = {
  SMALL: 1,
  MID: 3,
  NORMAL: 5,
  HIGH: 7,
  MAX: 15,
}

const categories = {
  'clipboard': {
    name: 'Clipboard Utilities',
    tags: [
      { tag: 'clipboard', weight: Weight.MAX },
      { tag: 'copy', weight: Weight.MID },
      { tag: 'cut', weight: Weight.MID },
    ], similar: ['clipboard', 'clipboardy', 'clipboard-copy', 'copy-text-to-clipboard', 'clipboard-polyfill']
  },
  'css-in-js': {
    name: 'CSS in JS libraries',
    tags: [
      { tag: 'css js', weight: Weight.NORMAL },
      { tag: 'styles', weight: Weight.NORMAL },
      { tag: 'inline', weight: Weight.NORMAL },
      { tag: 'in', weight: Weight.MID }
    ],
    similar: ['styled-components', 'radium', 'emotion', 'glamor']
  },
  'cookie': {
    name: 'Cookie Manipulation',
    tags: [
      { tag: 'cookie', weight: Weight.HIGH },
      { tag: 'manipulate', weight: Weight.NORMAL },
      { tag: 'http', weight: Weight.MID },
      { tag: 'client', weight: Weight.MID },
      { tag: 'parse', weight: Weight.MID },
      { tag: 'parser', weight: Weight.MID },
      { tag: 'jar', weight: Weight.NORMAL },
    ],
    similar: ['cookie', 'tough-cookie', 'js-cookie', 'tiny-cookie']
  },
  'date-nlp': {
    name: 'Natural language date-time utilities',
    tags: [
      { tag: 'date', weight: Weight.HIGH },
      { tag: 'time', weight: Weight.HIGH },
      { tag: 'parse', weight: Weight.MID },
      { tag: 'parser', weight: Weight.MID },
      { tag: 'nlp', weight: Weight.HIGH },
      { tag: 'natural language', weight: Weight.HIGH },
      { tag: 'format', weight: Weight.MID },
      { tag: 'human', weight: Weight.MID }
    ],
    similar: ['chrono-node', 'its-a-date', 'parse-messy-time']
  },
  'class-names-manipulation': {
    name: 'Class names manipulation',
    tags: [
      { tag: 'class', weight: Weight.LOW },
      { tag: 'classname', weight: Weight.HIGH },
      { tag: 'class-names', weight: Weight.HIGH },
      { tag: 'class-list', weight: Weight.MID },
    ],
    similar: ['classnames', 'merge-class-names']
  },
  'deep-equality': {
    name: 'Deep Equality Check',
    tags: [
      { tag: 'deep equal', weight: Weight.NORMAL },
      { tag: 'object', weight: Weight.MID },
      { tag: 'compare', weight: Weight.NORMAL },
      { tag: 'isequal', weight: Weight.HIGH },
    ], similar: ['fast-deep-equal', 'deep-eql', 'deep-equal', 'lodash.isequal']
  },
  'fetch-polyfill': {
    name: 'Fetch polyfills',
    tags: [
      { tag: 'fetch', weight: Weight.HIGH },
      { tag: 'polyfill', weight: Weight.NORMAL },
      { tag: 'xhr', weight: Weight.NORMAL },
      { tag: 'http', weight: Weight.MID },
      { tag: 'request', weight: Weight.MID },
    ],
    similar: ['whatwg-fetch', 'node-fetch', 'unfetch', 'make-fetch-happen']
  },
  'general-purpose-date-time': {
    name: 'General purpose date-time utilities',
    tags: [
      { tag: 'date', weight: Weight.HIGH },
      { tag: 'time', weight: Weight.HIGH },
      { tag: 'parse', weight: Weight.MID },
      { tag: 'parser', weight: Weight.MID },
      { tag: 'format', weight: Weight.MID }
    ],
    similar: ['moment', 'luxon', 'dayjs', 'date-fns']
  },
  'general-purpose-3d': {
    name: 'General purpose 3D libraries',
    tags: [
      { tag: '3d', weight: Weight.MAX },
      { tag: 'webgl', weight: Weight.MAX },
      { tag: 'gl', weight: Weight.HIGH },
    ],
    similar: ['three', 'babylonjs']
  },
  'general-purpose-animation': {
    name: 'General purpose animation libraries',
    tags: [
      { tag: 'animation', weight: Weight.HIGH },
      { tag: 'tween', weight: Weight.NORMAL },
      { tag: 'easing', weight: Weight.MID },
      { tag: 'morph', weight: Weight.MID },
      { tag: 'transform', weight: Weight.NORMAL },
      { tag: 'motion', weight: Weight.NORMAL },
      { tag: 'svg', weight: Weight.MID },
      { tag: 'physics', weight: Weight.MID },
      { tag: 'dom', weight: Weight.MID },
    ],
    similar: ['gsap', 'animejs', 'mo-js', 'popmotion']
  },
  'general-purpose-charting': {
    name: 'General purpose Charting libraries',
    tags: [
      { tag: 'dom', weight: Weight.MID },
      { tag: 'visualization', weight: Weight.HIGH },
      { tag: 'dataviz', weight: Weight.HIGH },
      { tag: 'svg', weight: Weight.SMALL },
      { tag: 'canvas', weight: Weight.MID },
      { tag: 'charts', weight: Weight.MAX },
      { tag: 'data', weight: Weight.MID }
    ],
    similar: ['d3', 'chart.js', 'echarts', 'frappe-charts', 'highcharts']
  },
  'graphql-client': {
    name: 'GraphQL Clients',
    tags: [
      { tag: 'graphql', weight: Weight.HIGH },
      { tag: 'client', weight: Weight.MID },
      { tag: 'js', weight: Weight.MID },
      { tag: 'javascript', weight: Weight.MID },
    ], similar: ['apollo-client', 'graphql.js', 'lokka', 'graphql', 'relay-runtime']
  },
  'http-request': {
    name: 'HTTP client libraries',
    tags: [
      { tag: 'http', weight: Weight.NORMAL },
      { tag: 'get', weight: Weight.NORMAL },
      { tag: 'post', weight: Weight.NORMAL },
      { tag: 'ajax', weight: Weight.HIGH },
      { tag: 'url', weight: Weight.SMALL },
      { tag: 'request', weight: Weight.HIGH },
      { tag: 'agent', weight: Weight.MID },
      { tag: 'xhr', weight: Weight.NORMAL },
    ],
    similar: ['got', 'axios', 'request']
  },
  'image-color-extraction': {
    name: 'Image color extraction',
    tags: [
      { tag: 'color', weight: Weight.HIGH },
      { tag: 'image', weight: Weight.HIGH },
      { tag: 'extract', weight: Weight.HIGH },
      { tag: 'dominant', weight: Weight.HIGH },
      { tag: 'palette', weight: Weight.HIGH },
      { tag: 'pixels', weight: Weight.MID }
    ],
    similar: ['img-color-extractor', 'color-thief-browser', 'colority', 'node-vibrant']
  },
  'immutable-data-structures': {
    name: 'Immutable Data',
    tags: [
      { tag: 'immutable', weight: Weight.HIGH },
      { tag: 'persistent', weight: Weight.NORMAL },
      { tag: 'functional', weight: Weight.MID },
      { tag: 'collection', weight: Weight.NORMAL },
      { tag: 'structure', weight: Weight.NORMAL },
      { tag: 'tree', weight: Weight.MID },
      { tag: 'freeze', weight: Weight.MID },
      { tag: 'cursor', weight: Weight.MID },
    ],
    similar: ['immutable', 'seamless-immutable', 'freezer-js', 'baobab']
  },
  'markdown-parser': {
    name: 'Markdown parsers',
    tags: [
      { tag: 'markdown', weight: Weight.HIGH },
      { tag: 'parse', weight: Weight.NORMAL },
      { tag: 'parser', weight: Weight.NORMAL },
      { tag: 'ast', weight: Weight.MID },
      { tag: 'abstract syntax tree', weight: Weight.MID },
      { tag: 'md', weight: Weight.HIGH }
    ],
    similar: ['markdown', 'markdown-it', 'marked', 'commonmark', 'snarkdown']
  },
  'memoization': {
    name: 'Memoization',
    tags: [
      { tag: 'memoize', weight: Weight.HIGH },
      { tag: 'cache', weight: Weight.NORMAL },
      { tag: 'performance', weight: Weight.MID }
    ],
    similar: ['memoize', 'memoize-one', 'lodash.memoize', 'mem', 'fast-memoize']
  },
  'number-manipulation': {
    name: 'Number and Currency Formatting',
    tags: [
      { tag: 'format', weight: Weight.NORMAL },
      { tag: 'manipulate', weight: Weight.NORMAL },
      { tag: 'currency', weight: Weight.NORMAL },
      { tag: 'money', weight: Weight.NORMAL },
      { tag: 'number', weight: Weight.HIGH }
    ],
    similar: ['numeral', 'numbro', 'accounting', 'currency.js']
  },
  'pdf-generator': {
    name: 'Client-side PDF Creation',
    tags: [
      { tag: 'pdf', weight: Weight.HIGH },
      { tag: 'generate', weight: Weight.MID },
      { tag: 'create', weight: Weight.MID },
      { tag: 'document', weight: Weight.MID },
      { tag: 'client', weight: Weight.NORMAL },
      { tag: 'browser', weight: Weight.NORMAL },
    ],
    similar: ['jspdf','pdfkit', 'pdfmake','react-pdf']
  },
  'promise-polyfill': {
    name: 'Promise polyfills',
    tags: [
      { tag: 'promise', weight: Weight.HIGH },
      { tag: 'polyfill', weight: Weight.MID },
      { tag: 'es6', weight: Weight.MID },
      { tag: 'aplus', weight: Weight.HIGH },
      { tag: 'async', weight: Weight.MID },
      { tag: 'implementation', weight: Weight.MID },
    ],
    similar: ['promise', 'es6-promise', 'promise-polyfill', 'es6-promise-polyfill']
  },
  'react-autocomplete': {
    name: 'React based autocomplete components',
    tags: [
      { tag: 'react', weight: Weight.NORMAL },
      { tag: 'autocomplete', weight: Weight.NORMAL },
      { tag: 'autosuggest', weight: Weight.NORMAL },
      { tag: 'typeahead', weight: Weight.NORMAL }
    ],
    similar: ['react-autosuggest', 'downshift', 'react-autowhatever', 'react-autocomplete']
  },
  'react-calendar': {
    name: 'React based calendars',
    tags: [
      { tag: 'react', weight: Weight.NORMAL },
      { tag: 'date', weight: Weight.NORMAL },
      { tag: 'calendar', weight: Weight.HIGH },
    ],
    similar: ['react-calendar', 'rc-calendar', 'simple-react-calendar']
  },
  'react-date-picker': {
    name: 'React based date pickers',
    tags: [
      { tag: 'react', weight: Weight.NORMAL },
      { tag: 'date', weight: Weight.NORMAL },
      { tag: 'picker', weight: Weight.NORMAL },
      { tag: 'date-picker', weight: Weight.HIGH }
    ],
    similar: ['react-date-picker', 'react-datepicker', 'react-dates']
  },
  'react-pdf': {
    name: 'React based PDF utilies',
    tags: [
      { tag: 'react', weight: Weight.NORMAL },
      { tag: 'pdf', weight: Weight.NORMAL },
    ],
    similar: ['react-pdf', 'react-pdf-js']
  },
  'schema-validation': {
    name: 'JSON schema validation',
    tags: [
      { tag: 'JSON', weight: Weight.MID },
      { tag: 'object', weight: Weight.MID },
      { tag: 'schema', weight: Weight.NORMAL },
      { tag: 'validator', weight: Weight.HIGH },
      { tag: 'JSON', weight: Weight.NORMAL },
      { tag: 'assert', weight: Weight.SMALL },
      { tag: 'check', weight: Weight.SMALL },
      { tag: 'structure', weight: Weight.MID },
    ],
    similar: ['jsonschema', 'joi', 'ajv', 'superstruct', 'yup', '@cesium133/forgjs']
  },
  'querystring-parser': {
    name: 'Query String Parsers',
    tags: [
      { tag: 'query string', weight: Weight.NORMAL },
      { tag: 'querystring', weight: Weight.HIGH },
      { tag: 'parse', weight: Weight.MID },
      { tag: 'parser', weight: Weight.MID },
      { tag: 'url', weight: Weight.MID },
      { tag: 'search params', weight: Weight.MID },
      { tag: 'qs', weight: Weight.MID },
      { tag: 'parameter', weight: Weight.NORMAL },
      { tag: 'params', weight: Weight.NORMAL }
    ],
    similar: ['qs', 'query-string', 'querystringify', 'querystring']
  },
  'rich-text-editors': {
    name: 'Rich Text Editors',
    tags: [
      { tag: 'richtext rich text editor WYSIWYG contenteditable', weight: Weight.NORMAL },
      { tag: '' }
    ],
    similar: ['slate', 'quill', 'draft-js', 'medium-editor', 'froala-editor']
  },
  'state-management': {
    name: 'State Management Libraries',
    tags: [
      { tag: 'state management', weight: Weight.NORMAL },
      { tag: 'copy-on-write', weight: Weight.MID },
      { tag: 'immutable', weight: Weight.MID },
      { tag: 'flux', weight: Weight.HIGH },
      { tag: 'reducer', weight: Weight.HIGH },
    ],
    similar: ['mobx', 'redux', 'immer', 'freactal']
  },
  'svg-manipulation': {
    name: 'SVG manipulation libraries',
    tags: [
      { tag: 'svg', weight: Weight.HIGH },
      { tag: 'vector', weight: Weight.HIGH },
      { tag: 'manipulate', weight: Weight.NORMAL },
      { tag: 'graphics', weight: Weight.MID },
      { tag: 'animation', weight: Weight.MID },
      { tag: 'javascript', weight: Weight.SMALL },
      { tag: 'two dimensional', weight: Weight.MID }
    ],
    similar: ['raphael', 'snapsvg', 'two.js']
  },
  'timezone-formatting': {
    name: 'Timezone Formatting',
    tags: [
      { tag: 'date', weight: Weight.NORMAL },
      { tag: 'time', weight: Weight.NORMAL },
      { tag: 'timezone', weight: Weight.MAX },
      { tag: 'parse', weight: Weight.MID },
      { tag: 'format', weight: Weight.MID }
    ],
    similar: ['moment-timezone', 'date-time-format-timezone', 'spacetime', 'date-fns-timezone']
  },
  'uuid': {
    name: 'Unique ID generators',
    tags: [
      { tag: 'uuid', weight: Weight.HIGH },
      { tag: 'guid', weight: Weight.HIGH },
      { tag: 'random', weight: Weight.MID },
      { tag: 'unique', weight: Weight.NORMAL },
      { tag: 'id', weight: Weight.NORMAL },
    ], similar: ['uuid', 'shortid', 'nanoid', 'cuid']
  },
  'vanilla-tooltip': {
    name: 'Tooltip Libraries',
    tags: [
      { tag: 'tooltip', weight: Weight.MAX },
      { tag: 'popover', weight: Weight.NORMAL },
      { tag: 'hint', weight: Weight.NORMAL },
    ],
    similar: ['tooltip.js', 'tippy.js', 'balloon-css', 'hint.css', 'microtip']
  },
  'vanilla-carousel': {
    name: 'Vanilla JS Sliders & Carousels',
    tags: [
      { tag: 'touch swipe', weight: Weight.MID },
      { tag: 'vanilla', weight: Weight.NORMAL },
      { tag: 'carousel', weight: Weight.MAX },
      { tag: 'slider', weight: Weight.MAX },
    ],
    similar: ['glider-js', 'slick-carousel', 'swiper','flickity']
  },
  'virtual-dom-engine': {
    name: 'Virtual DOM implementations',
    tags: [
      { tag: 'virtual', weight: Weight.NORMAL },
      { tag: 'dom', weight: Weight.NORMAL },
      { tag: 'render', weight: Weight.NORMAL },
      { tag: 'dominant', weight: Weight.HIGH },
      { tag: 'palette', weight: Weight.HIGH },
      { tag: 'pixels', weight: Weight.MID }
    ],
    similar: ['hyperhtml', 'snabbdom', 'virtual-dom']
  },
}

module.exports = { categories }
