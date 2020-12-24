
// This file exists only so that we can run the TypeScript compiler in the CI build
// to validate our typings.d.ts file. The code will not actually be run.

import * as ul from 'unlaunch-js-client-sdk';

var ver: string = ul.version;

var emptyOptions: ul.ULOptions = {};
var logger: ul.ULLogger = ul.createConsoleLogger("info");
var allOptions: ul.ULOptions = {
  bootstrap: { },
  hash: '',
  baseUrl: '',
  eventsUrl: '',
  streamUrl: '',
  streaming: true,
  useReport: true,
  sendULHeaders: true,
  evaluationReasons: true,
  fetchGoals: true,
  sendEvents: true,
  allAttributesPrivate: true,
  privateAttributeNames: [ 'x' ],
  allowFrequentDuplicateEvents: true,
  sendEventsOnlyForVariation: true,
  flushInterval: 1,
  samplingInterval: 1,
  streamReconnectDelay: 1,
  eventUrlTransformer: url => url + 'x',
  disableSyncEventPost: true,
  logger: logger
};
var userWithKeyOnly: ul.ULUser = { key: 'user' };
var user: ul.ULUser = {
  key: 'user',
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
var client: ul.ULClient = ul.initialize('env', user, allOptions);

client.waitUntilReady().then(() => {});
client.waitForInitialization().then(() => {});
client.waitUntilGoalsReady().then(() => {});

client.identify(user).then(() => {});
client.identify(user, undefined, () => {});
client.identify(user, 'hash').then(() => {});

var user: ul.ULUser = client.getUser();

client.flush(() => {});
client.flush().then(() => {});

var boolFlagValue: ul.ULFlagValue = client.variation('key', false);
var numberFlagValue: ul.ULFlagValue = client.variation('key', 2);
var stringFlagValue: ul.ULFlagValue = client.variation('key', 'default');

var detail: ul.ULEvaluationDetail = client.variationDetail('key', 'default');
var detailValue: ul.ULFlagValue = detail.value;
var detailIndex: number | undefined = detail.variationIndex;
var detailReason: ul.ULEvaluationReason = detail.reason;

client.setStreaming(true);
client.setStreaming();

function handleEvent() {}
client.on('event', handleEvent);
client.off('event', handleEvent);

client.track('event');
client.track('event', { someData: 'x' });
client.track('event', null, 3.5);

var flagSet: ul.ULFlagSet = client.allFlags();
var flagSetValue: ul.ULFlagValue = flagSet['key'];

client.close(() => {});
client.close().then(() => {});
