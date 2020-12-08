import { AsyncQueue } from 'launchdarkly-js-test-helpers';

export const numericUser = {
  key: 1,
  secondary: 2,
  ip: 3,
  country: 4,
  email: 5,
  firstName: 6,
  lastName: 7,
  avatar: 8,
  name: 9,
  anonymous: false,
  custom: { age: 99 },
};

// This returns a Promise with a .callback property that is a plain callback function; when
// called, it will resolve the promise with either a single value or an array of arguments.
export function promiseListener() {
  let cb;
  const p = new Promise(resolve => {
    cb = function(value) {
      if (arguments.length > 1) {
        resolve(Array.prototype.slice.call(arguments));
      } else {
        resolve(value);
      }
    };
  });
  p.callback = cb;
  return p;
}

export const stringifiedNumericUser = {
  key: '1',
  secondary: '2',
  ip: '3',
  country: '4',
  email: '5',
  firstName: '6',
  lastName: '7',
  avatar: '8',
  name: '9',
  anonymous: false,
  custom: { age: 99 },
};

export function makeBootstrap(flagsData) {
  const ret = { $flagsState: {} };
  for (const key in flagsData) {
    const state = { ...flagsData[key] };
    ret[key] = state.value;
    delete state.value;
    ret.$flagsState[key] = state;
  }
  return ret;
}

export function MockEventSender() {
  const calls = new AsyncQueue();
  let serverTime = null;
  let status = 200;
  const sender = {
    calls,
    sendEvents: (events, url) => {
      calls.add({ events, url });
      return Promise.resolve({ serverTime, status });
    },
    setServerTime: time => {
      serverTime = time;
    },
    setStatus: respStatus => {
      status = respStatus;
    },
  };
  return sender;
}
