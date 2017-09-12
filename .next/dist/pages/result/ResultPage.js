'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _keys = require('next/node_modules/babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _defineProperty2 = require('next/node_modules/babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

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

var _reactGa = require('react-ga');

var _reactGa2 = _interopRequireDefault(_reactGa);

var _head = require('next/dist/lib/head.js');

var _head2 = _interopRequireDefault(_head);

var _Layout = require('../../client/components/Layout');

var _Layout2 = _interopRequireDefault(_Layout);

var _BarGraph = require('../../client/components/BarGraph');

var _BarGraph2 = _interopRequireDefault(_BarGraph);

var _AutocompleteInput = require('../../client/components/AutocompleteInput');

var _AutocompleteInput2 = _interopRequireDefault(_AutocompleteInput);

var _ProgressSquare = require('../../client/components/ProgressSquare/ProgressSquare');

var _ProgressSquare2 = _interopRequireDefault(_ProgressSquare);

var _index = require('next/dist/lib/router/index.js');

var _index2 = _interopRequireDefault(_index);

var _link = require('next/dist/lib/link.js');

var _link2 = _interopRequireDefault(_link);

var _isEmptyObject = require('is-empty-object');

var _isEmptyObject2 = _interopRequireDefault(_isEmptyObject);

var _lodash = require('lodash.sortby');

var _lodash2 = _interopRequireDefault(_lodash);

var _common = require('../../utils/common.utils');

var _Stat = require('./Stat');

var _Stat2 = _interopRequireDefault(_Stat);

var _api = require('../../client/api');

var _api2 = _interopRequireDefault(_api);

var _ResultPage = require('./ResultPage.scss');

var _ResultPage2 = _interopRequireDefault(_ResultPage);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var GithubLogo = function GithubLogo(props) {
  return _react2.default.createElement('svg', (0, _extends3.default)({
    width: '33',
    height: '33',
    viewBox: '0 0 33 33',
    className: 'github-logo'
  }, props), _react2.default.createElement('title', null, 'Github Link'), _react2.default.createElement('path', {
    d: 'M16.6.46C7.6.46.33 7.76.33 16.76c0 7.17 4.67 13.3 11.14 15.43.8.1 1.1-.4 1.1-.8v-2.8c-4.54.9-5.5-2.2-5.5-2.2-.74-1.9-1.8-2.4-1.8-2.4-1.48-1 .1-1 .1-1 1.64.1 2.5 1.7 2.5 1.7 1.45 2.4 3.8 1.7 4.74 1.3.2-1.1.6-1.8 1.1-2.2-3.6-.4-7.4-1.8-7.4-8.1 0-1.8.7-3.28 1.7-4.4-.1-.4-.7-2.1.2-4.3 0 0 1.4-.48 4.5 1.63 1.3-.36 2.7-.54 4.1-.55 1.4 0 2.8.2 4.1.57 3.1-2.1 4.48-1.7 4.48-1.7.9 2.24.33 3.9.17 4.3 1 1.2 1.6 2.64 1.6 4.44 0 6.23-3.8 7.6-7.43 8 .6.5 1.1 1.5 1.1 3.04v4.47c0 .43.27.94 1.1.8 6.45-2.1 11.1-8.2 11.1-15.4 0-9-7.3-16.3-16.3-16.3',
    fill: '#161514'
  }));
};

var EmptyBox = function EmptyBox(props) {
  return _react2.default.createElement('svg', (0, _extends3.default)({
    width: '195',
    height: '179',
    viewBox: '0 0 195 179',
    xmlns: 'http://www.w3.org/2000/svg'
  }, props), _react2.default.createElement('path', {
    d: 'M71.16.03c-.15.02-.3.06-.44.12L1.18 31.95c-1.12.5-1.48 2.17-.68 3.1l22.72 26.57L.5 88.14c-.8.93-.44 2.6.68 3.1l22.66 10.37v43.48c0 .76.5 1.5 1.18 1.8l71.47 31.8c.5.2 1.1.2 1.6 0l71.6-31.8c.7-.3 1.13-1.04 1.13-1.8V101.6l22.67-10.36c1.1-.5 1.5-2.17.7-3.1l-22.7-26.52 22.7-26.57c.8-.93.45-2.6-.67-3.1L124 .15c-.35-.15-.75-.2-1.12-.13-.43.08-.83.3-1.12.62L97.36 26.9 72.96.66c-.45-.5-1.15-.73-1.8-.62zm-.07 4.34L94 29.1 26.34 59.2 5.24 34.5 71.07 4.36zm52.5 0l65.9 30.13-21.1 24.7-67.7-30.1 22.9-24.73zM97.34 32L164 61.62 97.36 91.18l-66.6-29.56L97.36 32zM26.33 63.98L94 94.1l-22.9 24.7L5.2 88.7l21.1-24.72zm142.06 0l21.1 24.7-65.9 30.13-22.9-24.7L168.4 64zm-73.07 34.4v75.34L27.8 143.67V103.4l42.9 19.63c.76.3 1.7.1 2.25-.5l22.4-24.15zm3.98 0l22.4 24.15c.57.6 1.5.8 2.26.5l42.9-19.62v40.3l-67.56 30V98.4z'
  }));
};

var ResultPage = function (_PureComponent) {
  (0, _inherits3.default)(ResultPage, _PureComponent);

  function ResultPage() {
    var _ref;

    var _temp, _this, _ret;

    (0, _classCallCheck3.default)(this, ResultPage);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return _ret = (_temp = (_this = (0, _possibleConstructorReturn3.default)(this, (_ref = ResultPage.__proto__ || (0, _getPrototypeOf2.default)(ResultPage)).call.apply(_ref, [this].concat(args))), _this), _this.state = {
      results: {},
      resultsPromiseState: null,
      resultsError: null,
      historicalResultsPromiseState: null,
      inputInitialValue: _this.props.url.query.p || '',
      historicalResults: []

      // Picked up from http://www.webpagetest.org/
      // Speed in KB/s
    }, _this.i = 0, _this.fetchResults = function (packageString) {
      var startTime = Date.now();

      _api2.default.getInfo(packageString).then(function (results) {
        var newPackageString = results.name + '@' + results.version;
        _this.setState({
          inputInitialValue: newPackageString,
          results: results
        }, function () {
          _index2.default.replace('/result?p=' + newPackageString);
          _reactGa2.default.pageview(window.location.pathname);
        });

        _reactGa2.default.event({
          category: 'Search',
          action: 'Search Success',
          label: packageString.replace(/@/g, '[at]')
        });

        _reactGa2.default.timing({
          category: 'Search',
          variable: 'result',
          value: Date.now() - startTime,
          label: packageString.replace(/@/g, '[at]')
        });
      }).catch(function (err) {
        _this.setState({
          resultsError: err,
          resultsPromiseState: 'rejected'
        });
        console.error(err);

        _reactGa2.default.event({
          category: 'Search',
          action: 'Search Failure',
          label: packageString.replace(/@/g, '[at]')
        });

        _reactGa2.default.exception({
          description: err.error ? err.error.code : err.toString()
        });
      });
    }, _this.fetchHistory = function (packageString) {
      _api2.default.getHistory(packageString).then(function (results) {
        _this.setState({
          historicalResultsPromiseState: 'fulfilled',
          historicalResults: results
        });
      }).catch(function (err) {
        _this.setState({ historicalResultsPromiseState: 'rejected' });
        console.error(err);
      });
    }, _this.handleSearchSubmit = function (packageString) {
      _reactGa2.default.event({
        category: 'Search',
        action: 'Searched',
        label: packageString.replace(/@/g, '[at]')
      });

      _this.setState({
        results: {},
        historicalResultsPromiseState: 'pending',
        resultsPromiseState: 'pending'
      });

      var normalizedQuery = packageString.trim().toLowerCase();

      _index2.default.push('/result?p=' + normalizedQuery);

      _this.fetchResults(normalizedQuery);
      _this.fetchHistory(normalizedQuery);
    }, _this.handleProgressDone = function () {
      _this.setState({
        resultsPromiseState: 'fulfilled'
      });
    }, _this.formatHistoricalResults = function () {
      var _this$state = _this.state,
          results = _this$state.results,
          historicalResults = _this$state.historicalResults;

      var totalVersions = (0, _extends3.default)({}, historicalResults, (0, _defineProperty3.default)({}, results.version, results));

      var formattedResults = (0, _keys2.default)(totalVersions).map(function (version) {
        if ((0, _isEmptyObject2.default)(totalVersions[version])) {
          return { version: version, disabled: true };
        }
        return {
          version: version,
          size: totalVersions[version].size,
          gzip: totalVersions[version].gzip
        };
      });
      var sorted = (0, _lodash2.default)(formattedResults, ['version']);
      return typeof window !== 'undefined' && window.innerWidth < 640 ? sorted.slice(-10) : sorted;
    }, _this.handleBarClick = function (reading) {
      var results = _this.state.results;

      var packageString = results.name + '@' + reading.version;
      _this.setState({ inputInitialValue: packageString });
      _this.handleSearchSubmit(packageString);

      _reactGa2.default.event({
        category: 'Graph',
        action: reading.disabled ? 'Graph Disabled Bar Click' : 'Graph Bar Click',
        label: packageString.replace(/@/g, '[at]')
      });
    }, _temp), (0, _possibleConstructorReturn3.default)(_this, _ret);
  }

  (0, _createClass3.default)(ResultPage, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      var query = this.props.url.query;

      if (query.p && query.p.trim()) {
        this.handleSearchSubmit(query.p);
      }
    }
  }, {
    key: 'componentWillReceiveProps',
    value: function componentWillReceiveProps(nextProps) {
      var query = this.props.url.query;
      var nextQuery = nextProps.url.query;

      if (!nextQuery || !nextQuery.p.trim()) {
        return;
      }

      var currentPackage = (0, _common.parsePackageString)(query.p);
      var nextPackage = (0, _common.parsePackageString)(nextQuery.p);

      if (currentPackage.name !== nextPackage.name && this.i++ < 5) {
        this.handleSearchSubmit(nextQuery.p);
      }
    }
  }, {
    key: 'render',
    value: function render() {
      var _state = this.state,
          inputInitialValue = _state.inputInitialValue,
          resultsPromiseState = _state.resultsPromiseState,
          resultsError = _state.resultsError,
          historicalResultsPromiseState = _state.historicalResultsPromiseState,
          results = _state.results;

      return _react2.default.createElement(_Layout2.default, { className: 'result-page' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _ResultPage2.default } }), resultsPromiseState === 'fulfilled' && _react2.default.createElement(_head2.default, null, _react2.default.createElement('title', null, results.name, '@', results.version, ' | BundlePhobia')), _react2.default.createElement('div', { className: 'page-container' }, _react2.default.createElement('header', { className: 'result-header' }, _react2.default.createElement('section', { className: 'result-header--left-section' }, _react2.default.createElement(_link2.default, { href: '/' }, _react2.default.createElement('a', null, _react2.default.createElement('div', { className: 'logo-small' }, _react2.default.createElement('span', null, 'Bundle'), _react2.default.createElement('span', { className: 'logo-small__alt' }, 'Phobia'))))), _react2.default.createElement('section', { className: 'result-header--right-section' }, _react2.default.createElement('a', { target: '_blank',
        href: 'https://github.com/pastelsky/bundlephobia' }, _react2.default.createElement(GithubLogo, null)))), _react2.default.createElement('div', { className: 'result__search-container' }, _react2.default.createElement(_AutocompleteInput2.default, {
        key: inputInitialValue,
        initialValue: inputInitialValue,
        className: 'result-header__search-input',
        onSearchSubmit: this.handleSearchSubmit
      })), resultsPromiseState === 'pending' && _react2.default.createElement(_ProgressSquare2.default, {
        isDone: !!results.version,
        onDone: this.handleProgressDone
      }), resultsPromiseState === 'fulfilled' && (results.hasJSModule || results.hasJSNext) && _react2.default.createElement('div', { className: 'flash-message' }, _react2.default.createElement('span', { className: 'flash-message__info-icon' }, 'i'), _react2.default.createElement('span', null, 'supports the\xA0', _react2.default.createElement('code', null, results.hasJSModule ? 'module' : 'jsnext:main'), '\xA0field. You can get smaller sizes with \xA0', _react2.default.createElement('a', { target: '_blank',
        href: 'http://2ality.com/2017/04/setting-up-multi-platform-packages.html#support-by-bundlers' }, 'tree shaking'), '.')), resultsPromiseState === 'fulfilled' && _react2.default.createElement('section', { className: 'content-container' }, _react2.default.createElement('div', { className: 'stats-container' }, _react2.default.createElement('div', { className: 'size-container' }, _react2.default.createElement('h3', null, ' Bundle Size '), _react2.default.createElement('div', { className: 'size-stats' }, _react2.default.createElement(_Stat2.default, {
        value: results.size,
        type: _Stat2.default.type.SIZE,
        label: 'Minified'
      }), _react2.default.createElement(_Stat2.default, {
        value: results.gzip,
        type: _Stat2.default.type.SIZE,
        label: 'Minified + Gzipped'
      }))), _react2.default.createElement('div', { className: 'time-container' }, _react2.default.createElement('h3', null, ' Download Time '), _react2.default.createElement('div', { className: 'time-stats' }, _react2.default.createElement(_Stat2.default, {
        value: results.gzip / 1024 / ResultPage.downloadSpeed.TWO_G,
        type: _Stat2.default.type.TIME,
        label: '2G Edge',
        infoText: 'Download Speed: \u2B07\uFE0F ' + ResultPage.downloadSpeed.TWO_G + ' kB/s'
      }), _react2.default.createElement(_Stat2.default, {
        value: results.gzip / 1024 / ResultPage.downloadSpeed.THREE_G,
        type: _Stat2.default.type.TIME,
        label: 'Emerging 3G',
        infoText: 'Download Speed: \u2B07\uFE0F ' + ResultPage.downloadSpeed.THREE_G + ' kB/s'
      })))), _react2.default.createElement('div', { className: 'chart-container' }, historicalResultsPromiseState === 'fulfilled' && _react2.default.createElement(_BarGraph2.default, {
        onBarClick: this.handleBarClick,
        readings: this.formatHistoricalResults()
      }))), resultsPromiseState === 'rejected' && _react2.default.createElement('div', { className: 'result-error' }, _react2.default.createElement(EmptyBox, { className: 'result-error__img' }), _react2.default.createElement('h2', { className: 'result-error__code' }, resultsError.error.code), _react2.default.createElement('p', {
        className: 'result-error__message',
        dangerouslySetInnerHTML: {
          __html: resultsError.error ? resultsError.error.message : 'Something went wrong!'
        }
      }))));
    }
  }]);

  return ResultPage;
}(_react.PureComponent);

ResultPage.downloadSpeed = {
  TWO_G: 30, // 2G Edge
  THREE_G: 50 // Emerging markets 3G
};
exports.default = ResultPage;