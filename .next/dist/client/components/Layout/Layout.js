'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _keys = require('next/node_modules/babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

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

var _extends2 = require('next/node_modules/babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _link = require('next/dist/lib/link.js');

var _link2 = _interopRequireDefault(_link);

var _reactGa = require('react-ga');

var _reactGa2 = _interopRequireDefault(_reactGa);

var _api = require('../../api');

var _api2 = _interopRequireDefault(_api);

var _Layout = require('./Layout.scss');

var _Layout2 = _interopRequireDefault(_Layout);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Heart = function Heart(props) {
  return _react2.default.createElement('svg', (0, _extends3.default)({
    width: '428',
    height: '364',
    viewBox: '0 0 428 364',
    xmlns: 'http://www.w3.org/2000/svg'
  }, props), _react2.default.createElement('path', {
    d: 'M402.8 43.48C339.3-38.96 214.33 9.68 214.33 93.4c0-83.72-124.96-132.36-188.46-49.92C-19 101.74-2.95 189.95 72.22 267.33c34.77 35.8 82.2 69.28 142.12 96.4C403.74 278 468.42 128.7 402.8 43.5z',
    fill: '#F05228',
    fillRule: 'evenodd'
  }));
};

var OutboundLink = _reactGa2.default.OutboundLink;

var Layout = function (_Component) {
  (0, _inherits3.default)(Layout, _Component);

  function Layout() {
    var _ref;

    var _temp, _this, _ret;

    (0, _classCallCheck3.default)(this, Layout);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return _ret = (_temp = (_this = (0, _possibleConstructorReturn3.default)(this, (_ref = Layout.__proto__ || (0, _getPrototypeOf2.default)(Layout)).call.apply(_ref, [this].concat(args))), _this), _this.state = {
      recentSearches: []
    }, _temp), (0, _possibleConstructorReturn3.default)(_this, _ret);
  }

  (0, _createClass3.default)(Layout, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      var _this2 = this;

      _api2.default.getRecentSearches(5).then(function (searches) {
        _this2.setState({
          recentSearches: (0, _keys2.default)(searches)
        });
      });
    }
  }, {
    key: 'render',
    value: function render() {
      var _props = this.props,
          children = _props.children,
          className = _props.className;
      var recentSearches = this.state.recentSearches;

      return _react2.default.createElement('section', { className: 'layout' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _Layout2.default } }), _react2.default.createElement('section', { className: className }, children), _react2.default.createElement('footer', null, _react2.default.createElement('div', { className: 'footer__recent-search-bar' }, _react2.default.createElement('div', { className: 'footer__recent-search-bar__wrap' }, _react2.default.createElement('h4', null, 'Recent searches'), _react2.default.createElement('ul', { className: 'footer__recent-search-list' }, recentSearches.map(function (search) {
        return _react2.default.createElement('li', { key: search }, _react2.default.createElement(_link2.default, { href: '/result?p=' + search }, _react2.default.createElement('a', null, search)));
      })))), _react2.default.createElement('section', { className: 'footer__split' }, _react2.default.createElement('div', { className: 'footer__description' }, _react2.default.createElement('h3', null, ' What does this thing do? '), _react2.default.createElement('p', null, 'JavsScript bloat is more real today than it ever was. Sites continuously get bigger as more (often redundant) libraries are thrown to solve new problems. Until of-course, the ', _react2.default.createElement('i', null, ' big rewrite '), 'happens.'), _react2.default.createElement('p', null, 'This thing lets you understand the performance cost of', _react2.default.createElement('code', null, 'npm\xA0install'), ' ing a new npm package before actually adding it to our bundle.'), _react2.default.createElement('p', null, 'Credits to ', _react2.default.createElement('a', { href: 'https://twitter.com/thekitze', target: '_blank' }, ' @thekitze '), 'for suggesting the name.')), _react2.default.createElement('div', { className: 'footer__credits' }, _react2.default.createElement(Heart, { className: 'footer__credits__heart' }), '\uFE0F', _react2.default.createElement(OutboundLink, {
        className: 'footer__credits-profile',
        eventLabel: 'Footer Profile Click',
        target: '_blank',
        to: 'https://github.com/pastelsky'
      }, '@pastelsky'), _react2.default.createElement(OutboundLink, {
        eventLabel: 'Footer Repo Click',
        target: '_blank',
        to: 'https://github.com/pastelsky/bundlephobia'
      }, _react2.default.createElement('button', { className: 'footer__credits-fork-button' }, 'Fork on GitHub'))))));
    }
  }]);

  return Layout;
}(_react.Component);

exports.default = Layout;