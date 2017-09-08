
<p align="center">
    <img src="https://cdn.rawgit.com/pastelsky/bundlephobia/bundlephobia/assets/site-logo.svg" alt="" width="310" height="250" />
</p>
<p align="center">
  <a href="https://bundlephobia.com"> bundlephobia.com </a>
</p>
<p align="center">
  Know the performance impact of including an npm package in your app's bundle.
</p>

## Features
- Works with ES6 packages
- Can build css and scss packages as well
- Reports historical trends

<p align="center">
    <img src="https://s26.postimg.org/6yfqxgsex/ezgif-1-6c5c883f13.gif" width="600" height="300"/>
</p>


## Running locally
### Commands
| script        | descriptioj  |
| ------------- |:-------------:|
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
AWS_LAMBDA_ENDPOINT=<some-endpoint/>
```

In the absence of such an endpoint, packages will be build locally using the [`getPackageStats` function](https://github.com/pastelsky/package-build-stats)
