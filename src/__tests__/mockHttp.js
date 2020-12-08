import * as url from 'url';
import { AsyncQueue } from 'launchdarkly-js-test-helpers';

// The js-sdk-common package does not do any HTTP requests itself, because the implementation of
// HTTP is platform-dependent and must be provided by the individual SDKs (e.g. the browser SDK,
// which uses XMLHttpRequest, versus the Electron SDK, which uses Node HTTP). So, for testing
// this package, there is no point in using an HTTP capture tool like Sinon or a real embedded
// HTTP server. Instead we use this simple implementation of the abstraction, which lets us set
// up test handlers with a syntax that imitates our launchdarkly-js-test-helpers HTTP server.

let lastServerId = 0;

export function MockHttpState() {
  const servers = {};

  return {
    newServer: () => {
      lastServerId++;
      const hostname = 'mock-server-' + lastServerId;
      const server = newMockServer(hostname);
      servers[hostname] = server;
      return server;
    },

    doRequest: (method, requestUrl, headers, body, synchronous) => {
      const urlParams = url.parse(requestUrl);
      const server = servers[urlParams.host];
      if (!server) {
        return { promise: Promise.reject('unknown host: ' + urlParams.host) };
      }
      return server._doRequest(method, urlParams, headers, body, synchronous);
    },
  };
}

function newMockServer(hostname) {
  let defaultHandler = respond(404);
  const matchers = [];
  const requests = new AsyncQueue();

  function dispatch(req, resp) {
    for (const i in matchers) {
      if (matchers[i](req, resp)) {
        return;
      }
    }
    defaultHandler(req, resp);
  }

  const server = {
    url: 'http://' + hostname,

    requests,

    nextRequest: async () => await requests.take(),

    byDefault: handler => {
      defaultHandler = handler;
      return server;
    },

    forMethodAndPath: (method, path, handler) => {
      const matcher = (req, resp) => {
        if (req.method === method.toLowerCase() && req.path === path) {
          handler(req, resp);
          return true;
        }
        return false;
      };
      matchers.push(matcher);
      return server;
    },

    close: () => {}, // currently we don't need to clean up the server state

    _doRequest: (method, urlParams, headers, body) => {
      const transformedHeaders = {};
      Object.keys(headers || {}).forEach(key => {
        transformedHeaders[key.toLowerCase()] = headers[key];
      });
      const req = {
        method: method.toLowerCase(),
        path: urlParams.path,
        headers: transformedHeaders,
        body,
      };
      requests.add(req);
      const ret = {};
      ret.promise = new Promise((resolve, reject) => {
        const resp = { resolve, reject };
        dispatch(req, resp);
      });
      return ret;
    },
  };

  return server;
}

export function respond(status, headers, body) {
  return (req, resp) => {
    const respProps = {
      // these are the properties our HTTP abstraction expects
      status,
      header: name => headers && headers[name.toLowerCase()],
      body,
    };
    resp.resolve(respProps);
  };
}

export function respondJson(data) {
  return respond(200, { 'content-type': 'application/json' }, JSON.stringify(data));
}

export const fakeNetworkErrorValue = new Error('fake network error');

export function networkError() {
  return (req, resp) => {
    resp.reject(fakeNetworkErrorValue);
  };
}
