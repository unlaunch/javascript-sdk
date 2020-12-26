### javascript-sdk

The unlaunch javascript browser-sdk code is available in develop branch. The client has dependency in javascript-sdk-common project which can be downloaded from https://github.com/unlaunch/javascript-sdk-common develop branch. After downloading the code from both repos follow below steps

1. Go to javascript-sdk-common directory and run 'npm install' and then run 'npm run build'

2. Go to javascript-sdk-common directory and run `npm link`. Then go to the javascript-client-sdk and type `npm link unlaunch-js-sdk-common`

3. Install javascript-client-sdk dependencies by running 'npm install' and then build 'npm run build'

4. Go to your project directory and run 'npm link path-to-js-client-sdk-dir'

5. In your project directory run 'npm install'

6. Import unlaunch-js-client-sdk in your project

```javascript
import * as ULClient from "unlaunch-js-client-sdk";
```
7. Define flagkeys in array to pass it to the initliaze method.  

```javascript
let flagKeys = ["js-flag"];
```

8. Declare identity property and create attributes object to pass it to the initliaze method.  

```javascript
let identity = 'user123';

let attributes = {
 
  "country": "US"
};
```

9. Create options object to pass optional properties in initialize method. The options object can take properties like evaluationReason, offline, bootstrap
 
```javascript
var options = {

  bootstrap: 'localstorage',
  evaluationReason: true,
  offline: true

}
```

10. Provide browser-client-id that starts with 'test-client' as first argument in initialize and other arguments

```javascript
let ulclient = ULClient.initialize('test-client-*************', flagKeys, identity , attributes, options);
```

11. Wait for the client to get ready. Use variation method to get the variation

```javascript
ulclient.on('ready', function() {
  
  let jsFlag = ulclient.variation("js-flag");
  
  if (jsFlag == 'on') {
    
    console.log("Hello. Js Flag is on");
    
  } else {
  
    console.log("Hello. Js Flag is off");

  }
});
```
12. To get variation configuration use variantConfig method

```javascript
let varConf = ulclient.variantConfig("js-flag");
```
