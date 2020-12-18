import * as errors from './errors';
import * as utils from './utils';
import uuidv1 from 'uuid/v1';

const MAX_URL_LENGTH = 2000;

export default function EventSender(platform, environmentId, options) {
  const imageUrlPath = '/a/' + environmentId + '.gif';
  const baseHeaders = utils.extend({ 'Content-Type': 'application/json' }, utils.getULHeaders(platform, options, environmentId));
  const httpFallbackPing = platform.httpFallbackPing; // this will be set for us if we're in the browser SDK
  const sender = {};

  function getResponseInfo(result) {
    const ret = { status: result.status };
    const dateStr = result.header('date');
    if (dateStr) {
      const time = Date.parse(dateStr);
      if (time) {
        ret.serverTime = time;
      }
    }
    return ret;
  }

  sender.sendChunk = (events, url, isDiagnostic, usePost) => {
    const jsonBody = JSON.stringify(events);
    const payloadId = isDiagnostic ? null : uuidv1();

    function doPostRequest(canRetry) {
      // const headers = isDiagnostic
      //   ? baseHeaders
      //   : utils.extend({}, baseHeaders, {
      //       'X-LaunchDarkly-Event-Schema': '3',
      //       'X-LaunchDarkly-Payload-ID': payloadId,
      //     });
      const headers = baseHeaders;

      return platform
        .httpRequest('POST', url, headers, jsonBody)
        .promise.then(result => {
          if (!result) {
            // This was a response from a fire-and-forget request, so we won't have a status.
            return;
          }
          if (result.status >= 400 && errors.isHttpErrorRecoverable(result.status) && canRetry) {
            return doPostRequest(false);
          } else {
            return getResponseInfo(result);
          }
        })
        .catch(() => {
          if (canRetry) {
            return doPostRequest(false);
          }
          return Promise.reject();
        });
    }

    if (usePost) {
      return doPostRequest(true).catch(() => {});
    } else {
      httpFallbackPing && httpFallbackPing(url + imageUrlPath + '?d=' + utils.base64URLEncode(jsonBody));
      return Promise.resolve(); // we don't wait for this request to complete, it's just a one-way ping
    }
  };

  sender.sendEvents = function(events, url, isDiagnostic) {
    if (!platform.httpRequest) {
      return Promise.resolve();
    }
    const canPost = platform.httpAllowsPost();
    let chunks;
    if (canPost) {
      // no need to break up events into chunks if we can send a POST
      chunks = [events];
    } else {
      chunks = utils.chunkUserEventsForUrl(MAX_URL_LENGTH - url.length, events);
    }
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      results.push(sender.sendChunk(chunks[i], url, isDiagnostic, canPost));
    }
    return Promise.all(results);
  };

  return sender;
}
