import {
  base64URLEncode,
  getLDHeaders,
  getLDUserAgentString,
  wrapPromiseCallback,
  chunkUserEventsForUrl,
} from '../utils';

import * as stubPlatform from './stubPlatform';

describe('utils', () => {
  describe('wrapPromiseCallback', () => {
    it('should resolve to the value', done => {
      const promise = wrapPromiseCallback(Promise.resolve('woohoo'));
      promise.then(value => {
        expect(value).toEqual('woohoo');
        done();
      });
    });

    it('should reject with the error', done => {
      const error = new Error('something went wrong');
      const promise = wrapPromiseCallback(Promise.reject(error));
      promise.catch(error => {
        expect(error).toEqual(error);
        done();
      });
    });

    it('should call the callback with a value if the promise resolves', done => {
      const promise = wrapPromiseCallback(Promise.resolve('woohoo'), (error, value) => {
        expect(promise).toBeUndefined();
        expect(error).toBeNull();
        expect(value).toEqual('woohoo');
        done();
      });
    });

    it('should call the callback with an error if the promise rejects', done => {
      const actualError = new Error('something went wrong');
      const promise = wrapPromiseCallback(Promise.reject(actualError), (error, value) => {
        expect(promise).toBeUndefined();
        expect(error).toEqual(actualError);
        expect(value).toBeNull();
        done();
      });
    });
  });

  describe('getLDHeaders', () => {
    it('sends no headers unless sendLDHeaders is true', () => {
      const platform = stubPlatform.defaults();
      const headers = getLDHeaders(platform, {});
      expect(headers).toEqual({});
    });

    it('adds custom user-agent header', () => {
      const platform = stubPlatform.defaults();
      const headers = getLDHeaders(platform, { sendLDHeaders: true });
      expect(headers).toMatchObject({ 'X-LaunchDarkly-User-Agent': getLDUserAgentString(platform) });
    });

    it('adds wrapper info if specified, without version', () => {
      const platform = stubPlatform.defaults();
      const headers = getLDHeaders(platform, { sendLDHeaders: true, wrapperName: 'FakeSDK' });
      expect(headers).toMatchObject({
        'X-LaunchDarkly-User-Agent': getLDUserAgentString(platform),
        'X-LaunchDarkly-Wrapper': 'FakeSDK',
      });
    });

    it('adds wrapper info if specified, with version', () => {
      const platform = stubPlatform.defaults();
      const headers = getLDHeaders(platform, { sendLDHeaders: true, wrapperName: 'FakeSDK', wrapperVersion: '9.9' });
      expect(headers).toMatchObject({
        'X-LaunchDarkly-User-Agent': getLDUserAgentString(platform),
        'X-LaunchDarkly-Wrapper': 'FakeSDK/9.9',
      });
    });
  });

  describe('getLDUserAgentString', () => {
    it('uses platform user-agent and package version by default', () => {
      const platform = stubPlatform.defaults();
      platform.version = undefined;
      const ua = getLDUserAgentString(platform);
      expect(ua).toEqual('stubClient/' + VERSION);
    });

    it('uses platform user-agent and platform version if provided', () => {
      const platform = stubPlatform.defaults();
      platform.version = '7.8.9';
      const ua = getLDUserAgentString(platform);
      expect(ua).toEqual('stubClient/7.8.9');
    });
  });

  describe('chunkUserEventsForUrl', () => {
    it('should properly chunk the list of events', () => {
      const user = { key: 'foo' };
      const event = { kind: 'identify', key: user.key };
      const eventLength = base64URLEncode(JSON.stringify(event)).length;
      const events = [event, event, event, event, event];
      const chunks = chunkUserEventsForUrl(eventLength * 2, events);
      expect(chunks).toEqual([[event, event], [event, event], [event]]);
    });
  });
});
