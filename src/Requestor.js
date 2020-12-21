import * as utils from './utils';
import * as errors from './errors';
import * as messages from './messages';
import promiseCoalescer from './promiseCoalescer';

const jsonContentType = 'application/json';

function getResponseError(result) {
  if (result.status === 404) {
    return new errors.LDInvalidEnvironmentIdError(messages.environmentNotFound());
  } else {
    return new errors.LDFlagFetchError(messages.errorFetchingFlags(result.statusText || String(result.status)));
  }
}

export default function Requestor(platform, options, environment) {
  const baseUrl = options.baseUrl;
  const useReport = options.useReport;
  const withReasons = options.evaluationReasons;
  const logger = options.logger;

  const requestor = {};

  const activeRequests = {}; // map of URLs to promiseCoalescers

  function fetchJSON(endpoint, body) {
    
    if (!platform.httpRequest) {
      return new Promise((resolve, reject) => {
        reject(new errors.LDFlagFetchError(messages.httpUnavailable()));
      });
    }

  //  const method = body ? 'REPORT' : 'GET';
    const method = body ? 'POST' : 'GET';
  //  const headers = utils.getLDHeaders(platform, options);
    const headers = {}
    
    if (body) {
      headers['Content-Type'] = jsonContentType;
    }

    let coalescer = activeRequests[endpoint];
    if (!coalescer) {
      coalescer = promiseCoalescer(() => {
        // this will be called once there are no more active requests for the same endpoint
        delete activeRequests[endpoint];
      });
      activeRequests[endpoint] = coalescer;
    }
    console.log("Calling endpoint " , endpoint + " body " + body);
    const req = platform.httpRequest(method, endpoint, headers, body);
    const p = req.promise.then(
      result => {
        if (result.status === 200) {
          // We're using substring here because using startsWith would require a polyfill in IE.
          if (
            result.header('content-type') &&
            result.header('content-type').substring(0, jsonContentType.length) === jsonContentType
          ) {
            console.log("Result recieved" , result.body);
            return JSON.parse(result.body);
          } else {
            const message = messages.invalidContentType(result.header('content-type') || '');
            return Promise.reject(new errors.LDFlagFetchError(message));
          }
        } else {
          return Promise.reject(getResponseError(result));
        }
      },
      e => Promise.reject(new errors.LDFlagFetchError(messages.networkError(e)))
    );
    coalescer.addPromise(p, () => {
      // this will be called if another request for the same endpoint supersedes this one
      req.cancel && req.cancel();
    });
    return coalescer.resultPromise;
  }

  // Performs a GET request to an arbitrary path under baseUrl. Returns a Promise which will resolve
  // with the parsed JSON response, or will be rejected if the request failed.
  requestor.fetchJSON = function(path) {
    return fetchJSON(baseUrl + path, null);
  };

  // Requests the current state of all flags for the given user from LaunchDarkly. Returns a Promise
  // which will resolve with the parsed JSON response, or will be rejected if the request failed.
  requestor.fetchFlagSettings = function(user, hash) {
    let data;
    let endpoint;
    let query = '';
    let body;

    if (useReport) {
      endpoint = [baseUrl, '/sdk/evalx/', environment, '/user'].join('');
      body = JSON.stringify(user);
    } else {
      data = utils.base64URLEncode(JSON.stringify(user));
      endpoint = [baseUrl, '/sdk/evalx/', environment, '/users/', data].join('');
    }
    if (hash) {
      query = 'h=' + hash;
    }
    if (withReasons) {
      query = query + (query ? '&' : '') + 'withReasons=true';
    }
    endpoint = endpoint + (query ? '?' : '') + query;
    logger.debug(messages.debugPolling(endpoint));

    return fetchJSON(endpoint, body);
  };

 
  requestor.fetchFlagsWithResult = function(user, flagKeys) {
    console.log("evaluate", user, flagKeys);
    let endpoint = [baseUrl, '/evaluate/', environment].join('') + '?evaluationReason=' + options.evaluationReason;
    
    let body = getRequestBody(flagKeys, user);
    
    body = JSON.stringify(body);
        
    return fetchJSON(endpoint, body);
  };

  function getRequestBody(flagKeys, user) {
    let requestUser = {};

    requestUser.attributes = {};
    requestUser.flagKeys = [];

    requestUser.flagKeys = flagKeys.toString();

    requestUser.id = user.identity || _getUUIDv4();

    let attributes = user.attributes;
    for (const attr in attributes) {
       // if (attr != "id") {
            requestUser.attributes[attr] = attributes[attr];
       // }
    }
  
    return requestUser;
  };

  function _getUUIDv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }

  return requestor;
}
