<p align="center">
    <img src="https://cdn.rawgit.com/pastelsky/bundlephobia/bundlephobia/client/assets/site-logo.svg" alt="" width="290" height="235" />
</p>
<p align="center">
  <a href="https://travis-ci.org/pastelsky/bundlephobia"><img src="https://img.shields.io/travis/pastelsky/bundlephobia/bundlephobia.svg" /></a>
  <img src="https://img.shields.io/npm/v/package-build-stats.svg" />
  <img src="https://img.shields.io/npm/l/package-build-stats.svg" />
</p>
<p align="center">
  <a href="https://bundlephobia.com"> bundlephobia.com </a> <br />
</p>
<p align="center">
  Know the performance impact of including an npm package in your app's bundle.
</p>

## Features

- Works with ES6 packages
- Can build css and scss packages as well (beta)
- Reports historical trends
- See package composition

## Badges

- [badgen.net](https://badgen.net/#bundlephobia) - example size of react: ![react](https://badgen.net/bundlephobia/minzip/react)
- [shields.io](https://shields.io/#/examples/size) - example size of react: ![react](https://img.shields.io/bundlephobia/minzip/react.svg)

## Built using bundlephobia

- Size in browser - As seen on package searches at [yarnpkg.com](https://yarnpkg.com)
- [bundlephobia-cli](https://github.com/AdrieanKhisbe/bundle-phobia-cli) - A Command Line client for bundlephobia
- [importcost](https://atom.io/packages/importcost) - An Atom plugin to display size of imported packages

## Support

Liked bundlephobia? Used it's API to build something cool? Let us know!

We could use some 💛 on our opencollective page –

<a href="https://opencollective.com/bundlephobia">
  <img src="https://opencollective.com/bundlephobia/tiers/backer.svg"/>
</a>

## FAQ

#### 1. Why does search for package X throw `MissingDependencyError` ?

This error is thrown if a package `require`s a dependency without adding it in its dependencies or peerDependencies list. In the absence of such a definition, we cannot reliably report the size of the package - since we cannot resolve any information about the package.

In such a case, it's best to report an issue with the package author asking the missing package to be added to its `package.json`

#### 2. I see a `BuildError` for package X, but I'm not sure why.

You can see a detailed stack trace in your devtools console, and [open an issue](https://github.com/pastelsky/bundlephobia/issues/new) with the relevant details. Working on a more ideal solution for this.

## Contributing

See [Contributing](https://github.com/pastelsky/bundlephobia/blob/bundlephobia/CONTRIBUTING.md)
