'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require('next/node_modules/babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _classCallCheck2 = require('next/node_modules/babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('next/node_modules/babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _unfetch = require('unfetch');

var _unfetch2 = _interopRequireDefault(_unfetch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var API = function () {
  function API() {
    (0, _classCallCheck3.default)(this, API);
  }

  (0, _createClass3.default)(API, null, [{
    key: 'get',
    value: function get(url) {
      return (0, _unfetch2.default)(url, {
        headers: {
          Accept: 'application/json'
        }
      }).then(function (res) {
        if (!res.ok) {
          if (res.status === 503) {
            return _promise2.default.reject({
              error: {
                code: 'TimeoutWarning',
                message: 'Woah! Looks like a large package. We\'ve queued up the build for you. Check back in a couple of seconds'
              }
            });
          }
          return res.json().then(function (err) {
            return _promise2.default.reject(err);
          });
        }
        return res.json();
      });
    }
  }, {
    key: 'getInfo',
    value: function getInfo(packageString) {
      return API.get('/api/size?package=' + packageString + '&record=true');
    }
  }, {
    key: 'getHistory',
    value: function getHistory(packageString) {
      return API.get('/api/package-history?package=' + packageString);
    }
  }, {
    key: 'getRecentSearches',
    value: function getRecentSearches(limit) {
      return API.get('/api/recent?limit=' + limit);
    }
  }, {
    key: 'getSuggestions',
    value: function getSuggestions(query) {

      var suggestionSort = function suggestionSort(packageA, packageB) {
        // Rank closely matching packages followed
        // by most popular ones
        if (Math.abs(Math.log(packageB.searchScore) - Math.log(packageA.searchScore)) > 1) {
          return packageB.searchScore - packageA.searchScore;
        } else {
          return packageB.score.detail.popularity - packageA.score.detail.popularity;
        }
      };

      return API.get('https://api.npms.io/v2/search/suggestions?q=' + query).then(function (result) {
        return result.sort(suggestionSort);
      });

      // backup when npms.io is down

      //return API.get(`/-/search?text=${query}`)
      //  .then(result => result.objects
      //    .sort(suggestionSort)
      //    .map(suggestion => {
      //      const name = suggestion.package.name
      //      const hasMatch = name.indexOf(query) > -1
      //      const startIndex = name.indexOf(query)
      //      const endIndex = startIndex + query.length
      //      let highlight
      //
      //      if (hasMatch) {
      //        highlight =
      //          name.substring(0, startIndex) +
      //          '<em>' + name.substring(startIndex, endIndex) + '</em>' +
      //          name.substring(endIndex)
      //      } else {
      //        highlight = name
      //      }
      //
      //      return {
      //        ...suggestion,
      //        highlight,
      //      }
      //    }),
      //  )
    }
  }]);

  return API;
}();

exports.default = API;