'use strict';

var _log = require('next/node_modules/babel-runtime/core-js/math/log10');

var _log2 = _interopRequireDefault(_log);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Firebase does not accept a
// few special characters for keys
function encodeFirebaseKey(key) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__');
}

function decodeFirebaseKey(key) {
  return key.replace(/[,]/g, '.').replace(/__/g, '/');
}

var formatSize = function formatSize(value) {
  var unit = void 0,
      size = void 0;
  if ((0, _log2.default)(value) < 3) {
    unit = 'B';
    size = value;
  } else if ((0, _log2.default)(value) < 6) {
    unit = 'kB';
    size = value / 1024;
  } else {
    unit = 'mB';
    size = value / 1024 / 1024;
  }

  return { unit: unit, size: size };
};

var formatTime = function formatTime(value) {
  var unit = void 0,
      size = void 0;
  if (value < 0.5) {
    unit = 'ms';
    size = Math.round(value * 1000);
  } else {
    unit = 's';
    size = value;
  }

  return { unit: unit, size: size };
};

module.exports = {
  encodeFirebaseKey: encodeFirebaseKey,
  decodeFirebaseKey: decodeFirebaseKey,
  formatTime: formatTime,
  formatSize: formatSize
};