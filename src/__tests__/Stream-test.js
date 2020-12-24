import { DiagnosticsAccumulator } from '../diagnosticEvents';
import * as messages from '../messages';
import Stream from '../Stream';
import { getULHeaders } from '../utils';

import { sleepAsync } from 'launchdarkly-js-test-helpers';
import EventSource from './EventSource-mock';
import * as stubPlatform from './stubPlatform';

const noop = () => {};

describe('Stream', () => {
  const baseUrl = 'https://example.com';
  const envName = 'testenv';
  const user = { key: 'me' };
  const encodedUser = 'eyJrZXkiOiJtZSJ9';
  const hash = '012345789abcde';
  const defaultConfig = { streamUrl: baseUrl, sendULHeaders: true };
  let logger;
  let platform;
  let baseHeaders;

  beforeEach(() => {
    logger = stubPlatform.logger();
    defaultConfig.logger = logger;
    platform = stubPlatform.defaults();
    baseHeaders = getULHeaders(platform, defaultConfig, '');
  });

  function makeExpectedStreamUrl(base64User, userHash, withReasons) {
    const url = baseUrl + '/eval/' + envName + '/' + base64User;
    const queryParams = [];
    if (userHash) {
      queryParams.push('h=' + userHash);
    }
    if (withReasons) {
      queryParams.push('?withReasons=true');
    }
    return url + (queryParams.length ? '?' + queryParams.join('&') : '');
  }

  it('should not throw on EventSource when it does not exist', () => {
    const platform1 = { ...platform };
    delete platform1['eventSourceFactory'];

    const stream = new Stream(platform1, defaultConfig, envName);

    const connect = () => {
      stream.connect(noop);
    };

    expect(connect).not.toThrow(TypeError);
  });

  it('should not throw when calling disconnect without first calling connect', () => {
    const stream = new Stream(platform, defaultConfig, envName);
    const disconnect = () => {
      stream.disconnect(noop);
    };

    expect(disconnect).not.toThrow(TypeError);
  });

  it('connects to EventSource with eval stream URL by default', async () => {
    const stream = new Stream(platform, defaultConfig, envName);
    stream.connect(user, null, {});

    await platform.testing.expectStream(makeExpectedStreamUrl(encodedUser));
  });

  it('adds secure mode hash to URL if provided', async () => {
    const stream = new Stream(platform, defaultConfig, envName);
    stream.connect(user, hash, {});

    await platform.testing.expectStream(makeExpectedStreamUrl(encodedUser, hash));
  });

  it('falls back to ping stream URL if useReport is true and REPORT is not supported', async () => {
    const config = { ...defaultConfig, useReport: true };
    const stream = new Stream(platform, config, envName);
    stream.connect(user, null, {});

    await platform.testing.expectStream(baseUrl + '/ping/' + envName);
  });

  it('sends request body if useReport is true and REPORT is supported', async () => {
    const platform1 = { ...platform, eventSourceAllowsReport: true };
    const config = { ...defaultConfig, useReport: true };
    const stream = new Stream(platform1, config, envName);
    stream.connect(user, null, {});

    const created = await platform.testing.expectStream(baseUrl + '/eval/' + envName);
    expect(created.options.method).toEqual('REPORT');
    expect(JSON.parse(created.options.body)).toEqual(user);
  });

  it('sends default SDK headers', async () => {
    const stream = new Stream(platform, defaultConfig, envName);
    stream.connect(user, null, {});

    const created = await platform.testing.expectStream(makeExpectedStreamUrl(encodedUser));
    expect(created.options.headers).toEqual(baseHeaders);
  });

  it('sends SDK headers with wrapper info', async () => {
    const config = { ...defaultConfig, wrapperName: 'FakeSDK' };
    const stream = new Stream(platform, config, envName);
    stream.connect(user, null, {});

    const created = await platform.testing.expectStream(makeExpectedStreamUrl(encodedUser));
    expect(created.options.headers).toEqual({ ...baseHeaders, 'X-LaunchDarkly-Wrapper': 'FakeSDK' });
  });

  it('does not send SDK headers when sendULHeaders is false', async () => {
    const config = { ...defaultConfig, sendULHeaders: false };
    const stream = new Stream(platform, config, envName);
    stream.connect(user, null, {});

    const created = await platform.testing.expectStream(makeExpectedStreamUrl(encodedUser));
    expect(created.options.headers).toEqual({});
  });

  it('sets event listeners', async () => {
    const stream = new Stream(platform, defaultConfig, envName);
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    stream.connect(user, null, {
      birthday: fn1,
      anniversary: fn2,
    });

    const created = await platform.testing.expectStream();
    const es = created.eventSource;

    es.mockEmit('birthday');
    expect(fn1).toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();

    es.mockEmit('anniversary');
    expect(fn2).toHaveBeenCalled();
  });

  it('reconnects after encountering an error', async () => {
    const config = { ...defaultConfig, streamReconnectDelay: 1, useReport: false };
    const stream = new Stream(platform, config, envName);
    stream.connect(user);

    const created = await platform.testing.expectStream();
    let es = created.eventSource;

    expect(es.readyState).toBe(EventSource.CONNECTING);
    es.mockOpen();
    expect(es.readyState).toBe(EventSource.OPEN);

    const nAttempts = 5;
    for (let i = 0; i < nAttempts; i++) {
      es.mockError('test error');
      const created1 = await platform.testing.expectStream();
      const es1 = created1.eventSource;

      expect(es.readyState).toBe(EventSource.CLOSED);
      expect(es1.readyState).toBe(EventSource.CONNECTING);

      es1.mockOpen();
      await sleepAsync(0); // make sure the stream logic has a chance to catch up with the new EventSource state

      expect(stream.isConnected()).toBe(true);

      es = es1;
    }
  });

  it('logs a warning for only the first failed connection attempt', async () => {
    const config = { ...defaultConfig, streamReconnectDelay: 1 };
    const stream = new Stream(platform, config, envName);
    stream.connect(user);

    const created = await platform.testing.expectStream();
    let es = created.eventSource;
    es.mockOpen();

    const nAttempts = 5;
    for (let i = 0; i < nAttempts; i++) {
      es.mockError('test error');
      const created1 = await platform.testing.expectStream();
      es = created1.eventSource;
      es.mockOpen();
    }

    // make sure there is just a single logged message rather than five (one per attempt)
    expect(logger.output.warn).toEqual([messages.streamError('test error', 1)]);
  });

  it('logs a warning again after a successful connection', async () => {
    const config = { ...defaultConfig, streamReconnectDelay: 1 };
    const stream = new Stream(platform, config, envName);
    const fakePut = jest.fn();
    stream.connect(user, null, {
      put: fakePut,
    });

    const created = await platform.testing.expectStream();
    let es = created.eventSource;
    es.mockOpen();

    const nAttempts = 5;
    for (let i = 0; i < nAttempts; i++) {
      es.mockError('test error #1');
      const created1 = await platform.testing.expectStream();
      es = created1.eventSource;
      es.mockOpen();
    }

    // simulate the re-establishment of a successful connection
    es.mockEmit('put', 'something');
    expect(fakePut).toHaveBeenCalled();

    for (let i = 0; i < nAttempts; i++) {
      es.mockError('test error #2');
      const created1 = await platform.testing.expectStream();
      es = created1.eventSource;
      es.mockOpen();
    }

    // make sure there is just a single logged message rather than five (one per attempt)
    expect(logger.output.warn).toEqual([
      messages.streamError('test error #1', 1),
      messages.streamError('test error #2', 1),
    ]);
  });

  describe('interaction with diagnostic events', () => {
    it('records successful stream initialization', async () => {
      const startTime = new Date().getTime();
      const acc = DiagnosticsAccumulator(startTime);
      const config = { ...defaultConfig, streamReconnectDelay: 1 };
      const stream = new Stream(platform, config, envName, acc);

      expect(acc.getProps().streamInits.length).toEqual(0);

      stream.connect(user, null, {
        put: jest.fn(),
      });

      const created = await platform.testing.expectStream();
      const es = created.eventSource;
      es.mockOpen();

      // streamInits should not be updated until we actually receive something
      expect(acc.getProps().streamInits.length).toEqual(0);

      es.mockEmit('put', 'something');

      const streamInits = acc.getProps().streamInits;
      expect(streamInits.length).toEqual(1);
      expect(streamInits[0].timestamp).toBeGreaterThanOrEqual(startTime);
      expect(streamInits[0].durationMillis).toBeGreaterThanOrEqual(0);
      expect(streamInits[0].failed).toBeFalsy();
    });

    it('records failed stream initialization', async () => {
      const startTime = new Date().getTime();
      const acc = DiagnosticsAccumulator(startTime);
      const config = { ...defaultConfig, streamReconnectDelay: 1 };
      const stream = new Stream(platform, config, envName, acc);

      expect(acc.getProps().streamInits.length).toEqual(0);

      stream.connect(user, null, {
        put: jest.fn(),
      });

      const created = await platform.testing.expectStream();
      const es = created.eventSource;
      es.mockError('test error');

      const streamInits = acc.getProps().streamInits;
      expect(streamInits.length).toEqual(1);
      expect(streamInits[0].timestamp).toBeGreaterThanOrEqual(startTime);
      expect(streamInits[0].durationMillis).toBeGreaterThanOrEqual(0);
      expect(streamInits[0].failed).toBe(true);
    });
  });
});
