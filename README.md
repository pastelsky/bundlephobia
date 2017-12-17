
<p align="center">
    <img src="https://cdn.rawgit.com/pastelsky/bundlephobia/bundlephobia/assets/site-logo.svg" alt="" width="310" height="250" />
</p>
<p align="center">
  <img src="https://img.shields.io/travis/pastelsky/bundlephobia/bundlephobia.svg" />
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
- Can build css and scss packages as well
- Reports historical trends

<p align="center">
    <img src="https://s26.postimg.org/6yfqxgsex/ezgif-1-6c5c883f13.gif" width="600" height="auto"/>
</p>

## Built using bundlephobia
- Size in browser - As seen on package searches at [yarnpkg.com](yarnpkg.com)
- [bundlephobia-cli](https://github.com/AdrieanKhisbe/bundle-phobia-cli) - A Command Line client for bundlephobia
- [importcost](https://atom.io/packages/importcost) - An Atom plugin to display size of imported packages

## FAQ

#### 1. Why does search for package X throw `MissingDependencyError` ?

This error is thrown if a package `require`s a dependency without adding it in its depdencies or peerDependencies list. In the absence of such a definition, we cannot reliably report the size of the package - since we cannot resolve any information about the package.

In such a case, it's best to report an issue with the package author asking the missing package to be added to its `package.json`

#### 2. I see a `BuildError` for package X, but I'm not sure why.

You can see a detailed stack trace in your devtools console, and [open an issue](https://github.com/pastelsky/bundlephobia/issues/new) with the relevant details. Working on a more ideal solution for this.

## Running locally
### Commands
| script        | description  |
| ------------- |:-------------|
| `yarn run dev`  | Start a development server locally |
| `yarn run build`    | Build for production      |
| `yarn run prod` | Start a production server locally      | 

### Adding the necessary keys
Add a `.env` file to the root with Algolia credentials. The server should still run without this, but some features might be disabled.
  
  
  ```ini
# App Id for NPM Registry
ALGOLIA_APP_ID=OFCNCOG2CU

# API Key
ALGOLIA_API_KEY=<api-key-obtained-from-algolia>
```

In addition, one can specify - 
```ini
BUILD_SERVICE_ENDPOINT=<endpoint-to-service>
```
In the absence of such an endpoint, packages will be built locally using the [`getPackageStats` function](https://github.com/pastelsky/package-build-stats)
and 

  ```ini
CACHE_SERVICE_ENDPOINT=<endpoint-to-service>

FIREBASE_API_KEY=<apiKey>
FIREBASE_AUTH_DOMAIN=<domain>
FIREBASE_DATABASE_URL=<url>
  ```
  for caching to work (optional).