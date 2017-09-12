"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _getPrototypeOf = require("next/node_modules/babel-runtime/core-js/object/get-prototype-of");

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require("next/node_modules/babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("next/node_modules/babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("next/node_modules/babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require("next/node_modules/babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

var _react = require("react");

var _react2 = _interopRequireDefault(_react);

var _document = require("next/dist/server/document.js");

var _document2 = _interopRequireDefault(_document);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var MyDocument = function (_Document) {
  (0, _inherits3.default)(MyDocument, _Document);

  function MyDocument() {
    (0, _classCallCheck3.default)(this, MyDocument);

    return (0, _possibleConstructorReturn3.default)(this, (MyDocument.__proto__ || (0, _getPrototypeOf2.default)(MyDocument)).apply(this, arguments));
  }

  (0, _createClass3.default)(MyDocument, [{
    key: "render",
    value: function render() {
      return _react2.default.createElement("html", null, _react2.default.createElement(_document.Head, null, _react2.default.createElement("meta", { charSet: "utf-8" }), _react2.default.createElement("meta", { httpEquiv: "x-ua-compatible", content: "ie=edge" }), _react2.default.createElement("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1, shrink-to-fit=no"
      }), _react2.default.createElement("title", null, "BundlePhobia | cost of adding a npm package"), _react2.default.createElement("meta", { name: "application-name", content: "BundlePhobia" }), _react2.default.createElement("meta", {
        name: "description",
        content: "Bundlephobia helps you find the performance impact of adding a npm package to your front-end bundle"
      }), _react2.default.createElement("link", { rel: "canonical", href: "https://bundlephobia.com" }), _react2.default.createElement("link", {
        href: "https://fonts.googleapis.com/css?family=Source+Code+Pro:300,400,600",
        rel: "stylesheet"
      }), _react2.default.createElement("link", {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png"
      }), _react2.default.createElement("link", {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png?l=4"
      }), _react2.default.createElement("link", {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png?l=3"
      }), _react2.default.createElement("link", { rel: "manifest", href: "/manifest.json" }), _react2.default.createElement("link", { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: "#5bbad5" }), _react2.default.createElement("meta", { name: "apple-mobile-web-app-title", content: "BundlePhobia" }), _react2.default.createElement("meta", { name: "application-name", content: "BundlePhobia" }), _react2.default.createElement("meta", { name: "theme-color", content: "#212121" }), _react2.default.createElement("meta", { property: "og:title", content: "BundlePhobia" }), _react2.default.createElement("meta", { property: "og:description",
        content: "Find the performance impact of adding a npm package to your bundle." }), _react2.default.createElement("meta", { property: "og:type", content: "website" }), _react2.default.createElement("meta", { property: "og:url", content: "https://bundlephobia.com" }), _react2.default.createElement("meta", { property: "og:image",
        content: "https://s26.postimg.org/4s64v24c9/Artboard_4.png" }), _react2.default.createElement("meta", { property: "twitter:creator", content: "@_pastelsky" }), _react2.default.createElement("script", {
        dangerouslySetInnerHTML: {
          __html: "\n          window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;\n          ga('create', 'UA-53900935-9', 'auto');\n        "
        }
      }), _react2.default.createElement("script", { async: true, src: "https://www.google-analytics.com/analytics.js" })), _react2.default.createElement("body", null, _react2.default.createElement(_document.Main, null), _react2.default.createElement(_document.NextScript, null)));
    }
  }], [{
    key: "getInitialProps",
    value: function getInitialProps(_ref) {
      var renderPage = _ref.renderPage;

      var _renderPage = renderPage(),
          html = _renderPage.html,
          head = _renderPage.head,
          chunks = _renderPage.chunks;

      return { html: html, head: head, chunks: chunks };
    }
  }]);

  return MyDocument;
}(_document2.default);

exports.default = MyDocument;