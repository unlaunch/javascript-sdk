# Contributing to This Project

The `launchdarkly-js-sdk-common` package provides core implementation components for several LaunchDarkly SDKs.

## Submitting bug reports and feature requests

Bug reports and feature requests, unless they are very specifically related to a piece of code in this project, should be filed in the individual SDK repositories instead. If you do have an issue specifically for this repository, the LaunchDarkly SDK team monitors the [issue tracker](https://github.com/launchdarkly/js-sdk-common/issues) and will respond to all newly filed issues within two business days.

## Submitting pull requests

We encourage pull requests and other contributions from the community. Before submitting pull requests, ensure that all temporary or unintended code is removed. Don't worry about adding reviewers to the pull request; the LaunchDarkly SDK team will add themselves. The SDK team will acknowledge all pull requests within two business days.

## Build instructions

### Prerequisites

The project uses `npm`, which is bundled in all supported versions of Node.

### Setup

To install project dependencies, from the project root directory:

```
npm install
```

### Testing

To run all unit tests:

```
npm test
```

To verify that the TypeScript declarations compile correctly (this involves compiling the file `test-types.ts`, so if you have changed any types or interfaces, you will want to update that code):

```
npm run check-typescript
```
