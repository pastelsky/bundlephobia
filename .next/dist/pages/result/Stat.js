'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Stat;

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _classnames = require('classnames');

var _classnames2 = _interopRequireDefault(_classnames);

var _Stat = require('./Stat.scss');

var _Stat2 = _interopRequireDefault(_Stat);

var _utils = require('../../utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Type = {
  SIZE: 'size',
  TIME: 'time'
};

function Stat(_ref) {
  var value = _ref.value,
      label = _ref.label,
      type = _ref.type,
      infoText = _ref.infoText;

  var roundedValue = type === Type.SIZE ? parseFloat((0, _utils.formatSize)(value).size.toFixed(1)) : parseFloat((0, _utils.formatTime)(value).size.toFixed(2));

  return _react2.default.createElement('div', { className: 'stat-container' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _Stat2.default } }), _react2.default.createElement('div', { className: 'stat-container__value-container' }, _react2.default.createElement('div', { className: 'stat-container__value-wrap' }, _react2.default.createElement('div', {
    className: (0, _classnames2.default)("stat-container__value", type),
    style: { transitionDuration: value + 's' },
    'data-value': roundedValue
  }, roundedValue)), _react2.default.createElement('div', { className: 'stat-container__unit' }, type === Type.SIZE ? (0, _utils.formatSize)(value).unit : (0, _utils.formatTime)(value).unit, ' ')), _react2.default.createElement('div', { className: 'stat-container__divider' }), _react2.default.createElement('div', { className: 'stat-container__footer' }, _react2.default.createElement('div', { className: 'stat-container__label' }, label), infoText && _react2.default.createElement('div', { className: 'stat-container__info-text', 'data-balloon-pos': 'right', 'data-balloon': infoText }, 'i')));
}

Stat.type = Type;