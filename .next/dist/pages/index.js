'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _getPrototypeOf = require('next/node_modules/babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('next/node_modules/babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('next/node_modules/babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('next/node_modules/babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('next/node_modules/babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _AutocompleteInput = require('../client/components/AutocompleteInput');

var _AutocompleteInput2 = _interopRequireDefault(_AutocompleteInput);

var _Layout = require('../client/components/Layout');

var _Layout2 = _interopRequireDefault(_Layout);

var _index = require('next/dist/lib/router/index.js');

var _index2 = _interopRequireDefault(_index);

var _reactGa = require('react-ga');

var _reactGa2 = _interopRequireDefault(_reactGa);

var _index3 = require('./index.scss');

var _index4 = _interopRequireDefault(_index3);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Home = function (_PureComponent) {
  (0, _inherits3.default)(Home, _PureComponent);

  function Home() {
    var _ref;

    var _temp, _this, _ret;

    (0, _classCallCheck3.default)(this, Home);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return _ret = (_temp = (_this = (0, _possibleConstructorReturn3.default)(this, (_ref = Home.__proto__ || (0, _getPrototypeOf2.default)(Home)).call.apply(_ref, [this].concat(args))), _this), _this.handleSearchSubmit = function (value) {
      _reactGa2.default.event({
        category: 'Search',
        action: 'Searched',
        label: value.trim().replace(/@/g, '[at]')
      });

      _index2.default.push('/result?p=' + value.trim());
    }, _temp), (0, _possibleConstructorReturn3.default)(_this, _ret);
  }

  (0, _createClass3.default)(Home, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      _reactGa2.default.pageview(window.location.pathname);
    }
  }, {
    key: 'render',
    value: function render() {
      return _react2.default.createElement(_Layout2.default, { className: 'homepage' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _index4.default } }), _react2.default.createElement('div', { className: 'homepage__container' }, _react2.default.createElement('svg', { className: 'logo-graphic',
        width: '137',
        height: '157',
        viewBox: '0 0 137 157',
        xmlns: 'http://www.w3.org/2000/svg' }, _react2.default.createElement('g', { stroke: '#000', strokeWidth: '1.5', fill: 'none', fillRule: 'evenodd' }, _react2.default.createElement('g', { transform: 'translate(37.21 45.73)' }, _react2.default.createElement('rect', { fill: '#C0C0C0',
        x: '25.1',
        y: '56.58',
        width: '16.74',
        height: '15.94',
        rx: '7.97' }), _react2.default.createElement('rect', { x: '25.1',
        y: '40.64',
        width: '16.74',
        height: '31.88',
        rx: '8.37' }), _react2.default.createElement('ellipse', { cx: '7.13', cy: '8.49', rx: '7.13', ry: '8.45' }), _react2.default.createElement('ellipse', { cx: '56.54', cy: '8.49', rx: '7.13', ry: '8.45' })), _react2.default.createElement('g', { className: 'logo__skeleton-group',
        opacity: '.15',
        transform: 'translate(104.153 25.807)' }, _react2.default.createElement('circle', { className: 'logo__skeleton',
        cx: '23.51',
        cy: '4.78',
        r: '4.78' }), _react2.default.createElement('circle', { className: 'logo__skeleton',
        cx: '6.18',
        cy: '87.47',
        r: '5.92' }), _react2.default.createElement('path', { className: 'logo__skeleton',
        d: 'M18.3 4.7l9.55.16m3.52 41.16L15 45.54m1.22-7.7L31.7 45.2' })), _react2.default.createElement('path', { d: 'M114.1 117.84c1.2-1.02 1.74-1.96 2.48-3.56l19.3-42.92c-2.02-27.1-3.44-40.7-3.44-40.77 0-2.7-2.14-4.8-4.78-4.8-2.6 0-4.73 2.1-4.78 4.7l-3.05 37.7-14.76 42.1c-.44.8-.7 1.8-.7 2.8 0 .83.2 1.64.5 2.4l10.43 40.12 11.55-3.1-12.74-34.8z' }), _react2.default.createElement('path', { className: 'logo__skeleton',
        d: 'M104.97 112.06l10.7 2.98',
        opacity: '.15' }), _react2.default.createElement('g', { className: 'logo__skeleton-group',
        opacity: '.15',
        transform: 'matrix(-1 0 0 1 33.225 25.807)' }, _react2.default.createElement('circle', { className: 'logo__skeleton',
        cx: '23.51',
        cy: '4.78',
        r: '4.78' }), _react2.default.createElement('circle', { className: 'logo__skeleton',
        cx: '6.18',
        cy: '87.47',
        r: '5.92' }), _react2.default.createElement('path', { className: 'logo__skeleton',
        d: 'M18.3 4.7l9.55.16m3.52 41.16L15 45.54m1.22-7.7L31.7 45.2' })), _react2.default.createElement('path', { d: 'M23.27 117.84c-1.2-1.02-1.73-1.96-2.47-3.56L1.5 71.36c2.02-27.1 3.43-40.7 3.43-40.77 0-2.7 2.14-4.8 4.8-4.8 2.6 0 4.72 2.1 4.77 4.7l3.05 37.7 14.75 42.2c.45.8.7 1.8.7 2.8 0 .8-.18 1.6-.5 2.4l-10.4 40.1-11.55-3.1 12.74-34.8z' }), _react2.default.createElement('path', { className: 'logo__skeleton',
        d: 'M32.4 112.06l-10.7 2.98',
        opacity: '.15' }), _react2.default.createElement('path', { d: 'M94.26 91.23c12.2-7.54 20.25-20.38 20.25-34.94 0-3.9-.5-7.6-1.5-11.1C112.8 21 93.2 1.5 68.98 1.5S25 21.02 24.87 45.2c-1.05 3.52-1.6 7.23-1.6 11.05 0 16.54 10.43 30.9 25.6 37.72-.1 1.4-.1 2.82-.1 4.26 0 23.22 10.22 42.04 22.9 42.04 12.65 0 22.92-18.8 22.92-42.03 0-2.4-.2-4.8-.4-7.1z' }), _react2.default.createElement('g', { className: 'logo__skeleton-group',
        opacity: '.15',
        transform: 'translate(23.263 1.5)' }, _react2.default.createElement('circle', { className: 'logo__skeleton',
        cx: '45.63',
        cy: '44.03',
        r: '44.03' }), _react2.default.createElement('ellipse', { className: 'logo__skeleton',
        cx: '45.63',
        cy: '54.79',
        rx: '45.62',
        ry: '42.04' }), _react2.default.createElement('ellipse', { className: 'logo__skeleton',
        cx: '48.39',
        cy: '96.83',
        rx: '22.93',
        ry: '42.04' })))), _react2.default.createElement('div', { className: 'logo' }, _react2.default.createElement('span', null, 'Bundle'), _react2.default.createElement('span', { className: 'logo__alt' }, 'Phobia')), _react2.default.createElement('h1', { className: 'homepage__tagline' }, 'find the cost of adding a npm package to your bundle'), _react2.default.createElement(_AutocompleteInput2.default, {
        containerClass: 'homepage__search-input-container',
        className: 'homepage__search-input',
        onSearchSubmit: this.handleSearchSubmit
      })));
    }
  }]);

  return Home;
}(_react.PureComponent);

exports.default = Home;