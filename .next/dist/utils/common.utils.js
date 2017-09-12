'use strict';

// Used by the server as well as the cloud function
// Use ES6 supported by Node v6.10 only!

var path = require('path');
var config = require('../server/config');

function parsePackageString(packageString) {
  // Scoped packages
  var name = void 0,
      version = void 0,
      scoped = false;
  var lastAtIndex = packageString.lastIndexOf('@');

  if (packageString.startsWith('@')) {
    scoped = true;
    if (lastAtIndex === 0) {
      name = packageString;
      version = null;
    } else {
      name = packageString.substring(0, lastAtIndex);
      version = packageString.substring(lastAtIndex + 1);
    }
  } else {
    if (lastAtIndex === -1) {
      name = packageString;
      version = null;
    } else {
      name = packageString.substring(0, lastAtIndex);
      version = packageString.substring(lastAtIndex + 1);
    }
  }

  return { name: name, version: version, scoped: scoped };
}

module.exports = { parsePackageString: parsePackageString };