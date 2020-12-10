### javascript-sdk

Two branches are created one for js-sdk-common and one for js-client-sdk in a single repo. Download the code  

1. Go to js-client-sdk directory and run 'npm link path-to-js-sdk-common-dir'

2. Go to your project directory and run 'npm link path-to-js-client-sdk-dir'

3. In your project directory run 'npm install'

4. Import js-client-sdk in your project

```javascript
import * as LDClient from "js-client-sdk";
```

5. Create user object for which flags needs to be evaluated

```javascript
var user = {
  "key": "abcd343",
  "country": "US"
};
```

6. Add flag keys in options to initialize client object with flags
 
```javascript
var options = {

  flagKeys: ["js-flag"]

}
```

7. Provide browser-client-id that starts with 'test-client' as first argument in initialize and user and options object

```javascript
var ldclient = LDClient.initialize('test-client-*************', user, options);
```

8. Wait for the client to get ready 

```javascript
ldclient.on('ready', function() {
  
  var jsFlag = ldclient.variation("js-flag", 'off');
  
  if (jsFlag == 'on') {
    
    console.log("Hello. Js Flag is on");
    
  } else {
  
    console.log("Hello. Js Flag is off");

  }
```
