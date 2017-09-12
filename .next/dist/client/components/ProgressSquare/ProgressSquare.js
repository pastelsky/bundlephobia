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

var _ProgressSquare = require('./ProgressSquare.scss');

var _ProgressSquare2 = _interopRequireDefault(_ProgressSquare);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ProgressSquare = function (_Component) {
  (0, _inherits3.default)(ProgressSquare, _Component);

  function ProgressSquare(props) {
    (0, _classCallCheck3.default)(this, ProgressSquare);

    var _this = (0, _possibleConstructorReturn3.default)(this, (ProgressSquare.__proto__ || (0, _getPrototypeOf2.default)(ProgressSquare)).call(this, props));

    _this.getProgressText = function (stage) {
      var progressText = {
        resolving: 'Resolving version and dependencies',
        building: 'Bundling package',
        minifying: 'Minifying, GZipping',
        calculating: 'Calculating file sizes'
      };
      return progressText[stage];
    };

    _this.setMessage = function () {
      var stage = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

      var timings = {
        resolving: 3 + Math.random() * 2,
        building: 5 + Math.random() * 3,
        minifying: 3 + Math.random() * 2,
        calculating: 20
      };

      var order = ['resolving', 'building', 'minifying', 'calculating'];

      if (_this.stage === order.length) {
        _this.props.onDone();
        return;
      }

      _this.setState({
        progressText: _this.getProgressText(order[_this.stage])
      });

      _this.timeoutId = setTimeout(function () {
        if (_this.stage < order.length) {
          _this.stage += 1;
        }

        _this.setMessage(_this.stage);
      }, timings[order[stage]] * 1000);
    };

    _this.stage = 0;
    _this.state = {};
    return _this;
  }

  (0, _createClass3.default)(ProgressSquare, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      this.setMessage();
    }
  }, {
    key: 'componentWillReceiveProps',
    value: function componentWillReceiveProps(nextProps) {
      var _this2 = this;

      if (nextProps.isDone) {
        this.stage = 3;

        setTimeout(function () {
          _this2.props.onDone();
        }, 1000);
      }
    }
  }, {
    key: 'shouldComponentUpdate',
    value: function shouldComponentUpdate(props, nextState) {
      return this.state.progressText !== nextState.progressText;
    }
  }, {
    key: 'componentWillUnmount',
    value: function componentWillUnmount() {
      clearTimeout(this.timeoutId);
    }
  }, {
    key: 'render',
    value: function render() {
      var progressText = this.state.progressText;

      return _react2.default.createElement('div', { className: 'progress-square' }, _react2.default.createElement('style', { dangerouslySetInnerHTML: { __html: _ProgressSquare2.default } }), _react2.default.createElement('span', { className: 'progress-square__loader' }, _react2.default.createElement('span', { className: 'progress-square__loader-inner' })), _react2.default.createElement('p', { className: 'progress-square__text' }, progressText));
    }
  }]);

  return ProgressSquare;
}(_react.Component);

exports.default = ProgressSquare;