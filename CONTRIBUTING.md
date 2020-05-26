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

### Commands

| script           | description                        |
| ---------------- | :--------------------------------- |
| `yarn run dev`   | Start a development server locally |
| `yarn run build` | Build for production               |
| `yarn run prod`  | Start a production server locally  |
