
// This file exists only so that we can run the TypeScript compiler in the CI build
// to validate our typings.d.ts file.

import * as ld from 'launchdarkly-js-sdk-common';

var ver: string = ld.version;

var logger: ld.LDLogger = ld.createConsoleLogger("info");
var userWithKeyOnly: ld.LDUser = { key: 'user' };
var anonUserWithNoKey: ld.LDUser = { anonymous: true };
var user: ld.LDUser = {
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

var client: ld.LDClientBase = {} as ld.LDClientBase;  // wouldn't do this in real life, it's just so the following statements will compile

client.waitUntilReady().then(() => {});
client.waitForInitialization().then(() => {});

client.identify(user).then(() => {});
client.identify(user, undefined, () => {});
client.identify(user, 'hash').then(() => {});

var user: ld.LDUser = client.getUser();

client.flush(() => {});
client.flush().then(() => {});

var boolFlagValue: ld.LDFlagValue = client.variation('key', false);
var numberFlagValue: ld.LDFlagValue = client.variation('key', 2);
var stringFlagValue: ld.LDFlagValue = client.variation('key', 'default');
var jsonFlagValue: ld.LDFlagValue = client.variation('key', [ 'a', 'b' ]);

var detail: ld.LDEvaluationDetail = client.variationDetail('key', 'default');
var detailValue: ld.LDFlagValue = detail.value;
var detailIndex: number | undefined = detail.variationIndex;
var detailReason: ld.LDEvaluationReason = detail.reason;

client.setStreaming(true);
client.setStreaming();

function handleEvent() {}
client.on('event', handleEvent);
client.off('event', handleEvent);

client.track('event');
client.track('event', { someData: 'x' });
client.track('event', null, 3.5);

var flagSet: ld.LDFlagSet = client.allFlags();
var flagSetValue: ld.LDFlagValue = flagSet['key'];

client.close(() => {});
client.close().then(() => {});
