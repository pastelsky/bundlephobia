'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _toConsumableArray2 = require('next/node_modules/babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

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

var _propTypes = require('prop-types');

var _propTypes2 = _interopRequireDefault(_propTypes);

var _utils = require('../../../utils');

var _BarGraph = require('./BarGraph.scss');

var _BarGraph2 = _interopRequireDefault(_BarGraph);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var BarGraph = function (_PureComponent) {
  (0, _inherits3.default)(BarGraph, _PureComponent);

  function BarGraph() {
    (0, _classCallCheck3.default)(this, BarGraph);

    return (0, _possibleConstructorReturn3.default)(this, (BarGraph.__proto__ || (0, _getPrototypeOf2.default)(BarGraph)).apply(this, arguments));
  }

  (0, _createClass3.default)(BarGraph, [{
    key: 'render',
    value: function render() {
      var _props = this.props,
          readings = _props.readings,
          onBarClick = _props.onBarClick;

      var gzipValues = readings.filter(function (reading) {
        return !reading.disabled;
      }).map(function (reading) {
        return reading.gzip;
      });

      var sizeValues = readings.filter(function (reading) {
        return !reading.disabled;
      }).map(function (reading) {
        return reading.size;
      });

      var maxValue = Math.max.apply(Math, [].concat((0, _toConsumableArray3.default)(gzipValues), (0, _toConsumableArray3.default)(sizeValues)));
      var scale = 100 / maxValue;

      var getTooltipMessage = function getTooltipMessage(reading) {
        var formattedSize = (0, _utils.formatSize)(reading.size);
        var formattedGzip = (0, _utils.formatSize)(reading.gzip);
        return 'Minified: ' + parseFloat(formattedSize.size).toFixed(1) + formattedSize.unit + ' | Gzipped: ' + parseFloat(formattedGzip.size).toFixed(1) + formattedGzip.unit;
      };

      return _react2.default.createElement('div', { className: 'bar-graph-container' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _BarGraph2.default } }), _react2.default.createElement('figure', { className: 'bar-graph' }, readings.map(function (reading, i) {
        return reading.disabled ? _react2.default.createElement('div', {
          key: i,
          className: 'bar-graph__bar-group bar-graph__bar-group--disabled',
          onClick: function onClick() {
            return onBarClick(reading);
          }
        }, _react2.default.createElement('div', {
          className: 'bar-graph__bar',
          style: { height: 50 + '%' },
          'data-balloon': 'Unknown | Click \uD83D\uDC46 to build'
        }, _react2.default.createElement('span', { className: 'bar-graph__bar-version' }, reading.version), _react2.default.createElement('span', { className: 'bar-graph__bar-version' }, reading.version))) : _react2.default.createElement('div', {
          onClick: function onClick() {
            return onBarClick(reading);
          },
          key: i, className: 'bar-graph__bar-group'
        }, _react2.default.createElement('div', {
          className: 'bar-graph__bar',
          style: { height: reading.size * scale + '%' },
          'data-balloon': getTooltipMessage(reading)
        }, _react2.default.createElement('span', { className: 'bar-graph__bar-version' }, reading.version)), _react2.default.createElement('div', {
          className: 'bar-graph__bar2',
          style: { height: reading.gzip * scale + '%' }
        }));
      })));
    }
  }]);

  return BarGraph;
}(_react.PureComponent);

exports.default = BarGraph;