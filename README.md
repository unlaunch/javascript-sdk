## Unlaunch JavaScript Library
The Unlaunch JavaScript Library provides JavaScript API to access Unlaunch feature flags and other features. Using this library, you can easily build JavaScript apps that can evaluate feature flags, dynamic configurations, and more.

### Important Links

- To create feature flags to use with JavaScript Library, login to your Unlaunch Console at [https://app.unlaunch.io](https://app.unlaunch.io)
- [Official Guide - Read this first](https://docs.unlaunch.io/docs/sdks/javascript-library)
- [npmjs](https://www.npmjs.com/package/unlaunch-js-client-libk)

### Compatibility
The Unlaunch JavaScript library doesn't require or depend on any specific JavaScript framework. You can use it with your favorite framework like Angular. If you want to integrate with React, we have a separate React SDK available.

### Browser Support
The Unlaunch Javascript Library can be used in all major browsers. However, some browsers may not support some features that the library uses, such as ES6 Promises. You may have to use polyfill if your target users use browsers that do not support ES6 Promise.

## Getting Started
Here is a simple example. 

First, add the library to your project. To load the JavaScript Library, include the following in the <head> or <body> tag of your webpage.

## Embed directly in your HTML
```javascript
<script crossorigin="anonymous" src="https://unpkg.com/unlaunch-js-client-lib@0.0.7">
</script>
```

## Integrate with a JavaScript framework
Or using, `npm install`:

```
npm i unlaunch-js-client-lib
```

and then,

```javascript
import * as ULClient from "unlaunch-js-client-lib";
```

Here's how you'd use JavaScript library in an HTML page.

```javascript
const flag = 'new-login-form-flag'
const apiKey = '<PROVIDE_BROWSER_PUBLIC_KEY_FOR_YOUR_PROJECT>'
const identity = 'anonymous' // Use special anonymous identity which generates a unique UUID

const options = {
    bootstrap: 'localstorage', // Use local storage
    evaluationReason: true,
}

const ulclient = ULClient.initialize(
    apiKey,
    [flag],
    identity,
    null,
    options
);

ulclient.on('ready', function () {

let variation = ulclient.variation(flag);
console.log(`[UL] Variation is ${variation}`)

const details = ulclient.variationDetail(flag);
console.log(`[UL] Evaluation reason is ${details.reason}`)


if (variation === 'on') {
    // Show the feature
} else {
    // Hide the feature
}

let config = ulclient.variationConfiguration(flag)
console.log(config)
});


```

For more information, see the [official guide](https://docs.unlaunch.io/docs/sdks/javascript-library).

## Build instructions

### Requirements
- npm version 6.14.5 or higher
- node version 12.18.2 or higher

The library has dependency in [javascript-sdk-common](https://github.com/unlaunch/javascript-sdk-common) project. After cloning both the repos, follow these steps.

1. Go to `javascript-sdk-common` directory and run `npm install` and then run `npm run build`
2. Go to `javascript-sdk-common` directory and run `npm link`. Then go to the `javascript-client-sd`k and type `npm link unlaunch-js-sdk-common`
3. Install `javascript-client-sdk` dependencies by running `npm install` and then build `npm run build`
4. Go to your project directory and run `npm link <path-to-js-client-sdk-directory>`
5. In your project directory run `npm install`
6. Import `unlaunch-js-client-lib` in your project or use the minified JavaScript library.

## Customization

You can use options to customize the client. For more information, see the [official guide](https://docs.unlaunch.io/docs/sdks/javascript-library#client-configuration).

```javascript
var options = {
     bootstrap: 'localstorage',
     evaluationReason: true,
     offline: false,
     requestTimeoutInMillis: 1000
}
```

### Offline Mode

You can start the SDK in offline mode for testing purposes. In offline mode, flags aren't downloaded from the server and no data is sent. All calls to `variation()` or its variants will return `control`. Read more in the [official guide](https://docs.unlaunch.io/docs/sdks/javascript-library#offline).
 

## Contributing
Please see [CONTRIBUTING](CONTRIBUTING.md) to find how you can contribute.

## License
Licensed under the Apache License, Version 2.0. See: [Apache License](LICENSE.md).

## Publish Releases on npmjs
<TODO>

## About Unlaunch
Unlaunch is a Feature Release Platform for engineering teams. Our mission is allow engineering teams of all
sizes to release features safely and quickly to delight their customers. To learn more about Unlaunch, please visit
[www.unlaunch.io](www.unlaunch.io). You can sign up to get started for free at [https://app.unlaunch.io/signup
](https://app.unlaunch.io/signup).


## More Questions?
At Unlaunch, we are obsessed about making it easier for developers all over the world to release features safely and with confidence. If you have *any* questions or something isn't working as expected, please email **unlaunch@gmail.com**.