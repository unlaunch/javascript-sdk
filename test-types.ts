
// This file exists only so that we can run the TypeScript compiler in the CI build
// to validate our typings.d.ts file.

import * as ul from 'unlaunch-js-sdk-common';

var ver: string = ul.version;

var logger: ul.ULLogger = ul.createConsoleLogger("info");
var userWithKeyOnly: ul.ULUser = { key: 'user' };
var anonUserWithNoKey: ul.ULUser = { anonymous: true };
var user: ul.ULUser = {
  key: 'user',
  secondary: 'otherkey',
  name: 'name',
  firstName: 'first',
  lastName: 'last',
  email: 'test@example.com',
  avatar: 'http://avatar.url',
  ip: '1.1.1.1',
  country: 'us',
  anonymous: true,
  custom: {
    'a': 's',
    'b': true,
    'c': 3,
    'd': [ 'x', 'y' ],
    'e': [ true, false ],
    'f': [ 1, 2 ]
  },
  privateAttributeNames: [ 'name', 'email' ]
};

var client: ul.ULClientBase = {} as ul.ULClientBase;  // wouldn't do this in real life, it's just so the following statements will compile

client.waitUntilReady().then(() => {});
client.waitForInitialization().then(() => {});

// client.identify(user).then(() => {});
// client.identify(user, undefined, () => {});
// client.identify(user, 'hash').then(() => {});

var user: ul.ULUser = client.getUser();

client.flush(() => {});
client.flush().then(() => {});

var boolFlagValue: ul.ULFlagValue = client.variation('key', false);
var numberFlagValue: ul.ULFlagValue = client.variation('key', 2);
var stringFlagValue: ul.ULFlagValue = client.variation('key', 'default');
var jsonFlagValue: ul.ULFlagValue = client.variation('key', [ 'a', 'b' ]);

var detail: ul.ULEvaluationDetail = client.variationDetail('key', 'default');
var detailValue: ul.ULFlagValue = detail.value;
var detailIndex: number | undefined = detail.variationIndex;
var detailReason: ul.ULEvaluationReason = detail.reason;

// client.setStreaming(true);
// client.setStreaming();

function handleEvent() {}
client.on('event', handleEvent);
client.off('event', handleEvent);

// client.track('event');
// client.track('event', { someData: 'x' });
// client.track('event', null, 3.5);

var flagSet: ul.ULFlagSet = client.allFlags();
var flagSetValue: ul.ULFlagValue = flagSet['key'];

client.close(() => {});
client.close().then(() => {});
