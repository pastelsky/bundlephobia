
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

## FAQ

**1. Why does search for package X throw `MissingDependencyError` ?**
This error is thrown if a package `require`s a dependency without adding it in its depdencies or peerDependencies list. In the absence of such a definition, we cannot reliably report the size of the package - since we cannot resolve any information about the package.

In such a case, it's best to report an issue with the package author asking the missing package to be added to its `package.json`

**2. I see a `BuildError` for package X, but I'm not sure why.**
There can be multiple reasons behind this. You can see a detailed stack trace in your devtools console, and [open an issue](https://github.com/pastelsky/bundlephobia/issues/new) with the relevant details. Working on a more ideal solution for this.

## Running locally
### Commands
| script        | description  |
| ------------- |:-------------|
| `yarn run dev`  | Start a development server locally |
| `yarn run build`    | Build for production      |
| `yarn run prod` | Start a production server locally      | 

### Optional steps
Add a `.env` file to the root with firebase credentials for caching to work.
  
  ```ini
FIREBASE_API_KEY=<apiKey>
FIREBASE_AUTH_DOMAIN=<domain>
FIREBASE_DATABASE_URL=<url>
  ```
  
  Also, one can add a link to an AWS Lambda cloud function by adding: 
  ```ini
AWS_LAMBDA_ENDPOINT=<some-endpoint>
```

In the absence of such an endpoint, packages will be built locally using the [`getPackageStats` function](https://github.com/pastelsky/package-build-stats)
