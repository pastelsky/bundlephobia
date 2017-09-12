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

var _api = require('../../api');

var _api2 = _interopRequireDefault(_api);

var _reactAutocomplete = require('react-autocomplete');

var _reactAutocomplete2 = _interopRequireDefault(_reactAutocomplete);

var _classnames = require('classnames');

var _classnames2 = _interopRequireDefault(_classnames);

var _AutocompleteInput = require('./AutocompleteInput.scss');

var _AutocompleteInput2 = _interopRequireDefault(_AutocompleteInput);

var _debounce = require('debounce');

var _debounce2 = _interopRequireDefault(_debounce);

var _common = require('../../../utils/common.utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var AutocompleteInput = function (_PureComponent) {
  (0, _inherits3.default)(AutocompleteInput, _PureComponent);

  function AutocompleteInput() {
    var _ref;

    var _temp, _this, _ret;

    (0, _classCallCheck3.default)(this, AutocompleteInput);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return _ret = (_temp = (_this = (0, _possibleConstructorReturn3.default)(this, (_ref = AutocompleteInput.__proto__ || (0, _getPrototypeOf2.default)(AutocompleteInput)).call.apply(_ref, [this].concat(args))), _this), _this.state = {
      value: _this.props.initialValue,
      suggestions: []
    }, _this.getSuggestions = (0, _debounce2.default)(function (value) {
      _api2.default.getSuggestions(value).then(function (result) {
        _this.setState({ suggestions: result });
      });
    }, 150), _this.renderSuggestionItem = function (item, isHighlighted) {
      return _react2.default.createElement('div', {
        className: (0, _classnames2.default)('autocomplete-input__suggestion', {
          'autocomplete-input__suggestion--highlight': isHighlighted
        })
      }, _react2.default.createElement('div', { dangerouslySetInnerHTML: { __html: item.highlight } }), _react2.default.createElement('div', { className: 'autocomplete-input__suggestion-description' }, item.package.description));
    }, _this.handleSubmit = function (e, e2, value) {
      var onSearchSubmit = _this.props.onSearchSubmit;

      if (e) {
        e.preventDefault();
      }

      onSearchSubmit(value || _this.state.value);
    }, _this.handleInputChange = function (_ref2) {
      var target = _ref2.target;

      _this.setState({ value: target.value });
      var trimmedValue = target.value.trim();

      var _parsePackageString = (0, _common.parsePackageString)(trimmedValue),
          name = _parsePackageString.name;

      if (trimmedValue.length > 1) {
        _this.getSuggestions(name);
      }
    }, _temp), (0, _possibleConstructorReturn3.default)(_this, _ret);
  }

  (0, _createClass3.default)(AutocompleteInput, [{
    key: 'render',
    value: function render() {
      var _this2 = this;

      var _props = this.props,
          className = _props.className,
          containerClass = _props.containerClass;
      var _state = this.state,
          suggestions = _state.suggestions,
          value = _state.value;

      var _parsePackageString2 = (0, _common.parsePackageString)(value),
          name = _parsePackageString2.name,
          version = _parsePackageString2.version;

      var baseFontSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 22 : 35;
      var maxFullSizeChars = typeof window !== 'undefined' && window.innerWidth < 640 ? 15 : 20;
      var searchFontSize = value.length < maxFullSizeChars ? null : baseFontSize - (value.length - maxFullSizeChars) * 0.8 + 'px';

      return _react2.default.createElement('form', {
        className: (0, _classnames2.default)(containerClass, "autocomplete-input__form"),
        onSubmit: this.handleSubmit
      }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _AutocompleteInput2.default } }), _react2.default.createElement('div', { className: (0, _classnames2.default)("autocomplete-input__container", className) }, _react2.default.createElement(_reactAutocomplete2.default, {
        getItemValue: function getItemValue(item) {
          return item.package.name;
        },
        inputProps: {
          placeholder: 'find package',
          className: 'autocomplete-input',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          style: { fontSize: searchFontSize }
        },
        onChange: this.handleInputChange,
        autoHighlight: false,
        ref: function ref(s) {
          return _this2.searchInput = s;
        },
        value: value,
        items: suggestions,
        onSelect: function onSelect(value, item) {
          _this2.setState({ value: value, suggestions: [item] });
          _this2.handleSubmit(null, null, value);
        },
        renderMenu: function renderMenu(items, value, inbuiltStyles) {
          return _react2.default.createElement('div', {
            style: { minWidth: inbuiltStyles.minWidth },
            className: 'autocomplete-input__suggestions-menu',
            children: items
          });
        },
        wrapperStyle: {
          display: 'inline-block',
          width: '100%',
          position: 'relative'
        },
        renderItem: this.renderSuggestionItem
      }), _react2.default.createElement('div', {
        style: { fontSize: searchFontSize },
        className: 'autocomplete-input__dummy-input'
      }, _react2.default.createElement('span', { className: 'dummy-input__package-name' }, name), version !== null && _react2.default.createElement('span', { className: 'dummy-input__at-separator' }, '@'), _react2.default.createElement('span', { className: 'dummy-input__package-version' }, version))), _react2.default.createElement('div', { className: 'autocomplete-input__search-icon',
        onClick: this.handleSubmit }, _react2.default.createElement('svg', {
        width: '90',
        height: '90',
        viewBox: '0 0 90 90',
        xmlns: 'http://www.w3.org/2000/svg'
      }, _react2.default.createElement('path', { d: 'M89.32 86.5L64.25 61.4C77.2 47 76.75 24.72 62.87 10.87 55.93 3.92 46.7.1 36.87.1s-19.06 3.82-26 10.77C3.92 17.8.1 27.05.1 36.87s3.82 19.06 10.77 26c6.94 6.95 16.18 10.77 26 10.77 9.15 0 17.8-3.32 24.55-9.4l25.08 25.1c.38.4.9.57 1.4.57.52 0 1.03-.2 1.42-.56.78-.78.78-2.05 0-2.83zM36.87 69.63c-8.75 0-16.98-3.4-23.17-9.6-6.2-6.2-9.6-14.42-9.6-23.17 0-8.75 3.4-16.98 9.6-23.17 6.2-6.2 14.42-9.6 23.17-9.6 8.75 0 16.98 3.4 23.18 9.6 12.77 12.75 12.77 33.55 0 46.33-6.2 6.2-14.43 9.6-23.18 9.6z' }))));
    }
  }]);

  return AutocompleteInput;
}(_react.PureComponent);

AutocompleteInput.defaultProps = {
  initialValue: ''
};
exports.default = AutocompleteInput;