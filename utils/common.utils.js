// Used by the server as well as the client
// Use ES5 only

function getComparisonCount(searchText = '') {
  return searchText.split(',').length;
}

function isComparingPackages(searchText = '') {
  return getComparisonCount(searchText) > 1;
}

function parsePackageString(packageString) {
  // Scoped packages
  let name, version, scoped = false
  const lastAtIndex = packageString.lastIndexOf('@')

  if (packageString.startsWith('@')) {
    scoped = true
    if (lastAtIndex === 0) {
      name = packageString
      version = null
    } else {
      name = packageString.substring(0, lastAtIndex)
      version = packageString.substring(lastAtIndex + 1)
    }
  } else {
    if (lastAtIndex === -1) {
      name = packageString
      version = null
    } else {
      name = packageString.substring(0, lastAtIndex)
      version = packageString.substring(lastAtIndex + 1)
    }
  }

  return { name, version, scoped }
}

function parseComparedPackageString(packageString) {
  const commaSeperatedStr = packageString.split(',');
  const commas = Array(commaSeperatedStr.length - 1).fill(',');
  return commaSeperatedStr.map(str => {
    const [name, versionNumber] = str.split('@');
    const hasAt = str.match(/@/) ? `@` : '';
    const comma = commas.length ? commas.pop() : '';
    const version = `${versionNumber ? versionNumber : ''}${comma}`;
    return { name, version, hasAt };
  });
}

module.exports = { parsePackageString, isComparingPackages, getComparisonCount, parseComparedPackageString }

