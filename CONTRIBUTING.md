Thanks for looking to help 👋. Have a nice time contributing to bundlephobia.
If you've any queries regarding setup or contributing, feel free to open an issue.
I'll try my best to answer as soon as I can.

Note: This repository only contains the frontend, and the request server.
If you're looking to make changes to the core logic – building of packages and size calculation, you need to look here instead - [package-build-stats](https://github.com/pastelsky/package-build-stats)

## Running locally

### Adding the necessary keys (Optional)

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

### Canvas compile issues

Bundlephobia relies on [`canvas`](https://www.npmjs.com/package/canvas) which may need to be built from source (depending on your platform). If so, [install the required packages listed in their docs](https://github.com/Automattic/node-canvas#compiling).

### Commands

| script           | description                        |
| ---------------- | :--------------------------------- |
| `yarn run dev`   | Start a development server locally |
| `yarn run build` | Build for production               |
| `yarn run prod`  | Start a production server locally  |

### Troubleshooting

#### Node version 18
If you are using Node.js version 18 and encounter the following error during execution:


```
Error: error:0308010C:digital envelope routines::unsupported
    at new Hash (node:internal/crypto/hash:69:19)
    at Object.createHash (node:crypto:133:10)
    at module.exports (~/bundlephobia/node_modules/package-build-stats/node_modules/webpack/lib/util/createHash.js:135:53)
    at NormalModule._initBuildHash (~/bundlephobia/node_modules/package-build-stats/node_modules/webpack/lib/NormalModule.js:417:16)
    at handleParseError (~/bundlephobia/node_modules/package-build-stats/node_modules/webpack/lib/NormalModule.js:471:10)
    at ~/bundlephobia/node_modules/package-build-stats/node_modules/webpack/lib/NormalModule.js:503:5
    at ~/bundlephobia/node_modules/package-build-stats/node_modules/webpack/lib/NormalModule.js:358:12
    at ~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:373:3
    at iterateNormalLoaders (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:214:10)
    at iterateNormalLoaders (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:221:10)
    at ~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:236:3
    at runSyncOrAsync (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:130:11)
    at iterateNormalLoaders (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:232:2)
    at iterateNormalLoaders (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:221:10)
    at ~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:236:3
    at context.callback (~/bundlephobia/node_modules/loader-runner/lib/LoaderRunner.js:111:13)
```

you can resolve it by running the command:

```NODE_OPTIONS=--openssl-legacy-provider yarn run dev```
