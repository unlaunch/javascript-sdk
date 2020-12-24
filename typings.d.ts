/**
 * This is the API reference for the Unlaunch SDK for browser JavaScript.
 *
 * In typical usage, you will call [[initialize]] once at startup time to obtain an instance of
 * [[ULClient]], which provides access to all of the SDK's functionality.
 *
 * For more information, see the [SDK reference guide](http://docs.unlaunch.com/docs/js-sdk-reference).
 */
declare module 'unlaunch-js-client-sdk' {

//// DOCBUILD-START-REPLACE  (see docs/Makefile)
  export * from 'unlaunch-js-sdk-common';
  import { ULClientBase, ULOptionsBase, ULUser } from 'unlaunch-js-sdk-common';
//// DOCBUILD-END-REPLACE

  /**
   * Creates an instance of the Unlaunch client.
   *
   * The client will begin attempting to connect to Unlaunch as soon as it is created. To
   * determine when it is ready to use, call [[ULClient.waitForInitialization]], or register an
   * event listener for the `"ready"` event using [[ULClient.on]].
   *
   * Note that you can either import this as a named export or as part of the default exports,
   * although the latter is deprecated:
   *
   *     // Preferred usage:
   *     import { initialize } from 'unlaunch-js-client-sdk';
   *     const client = initialize(clientSdkKey,flagKeys, identity, attributes, options);
   *
   *  
   * @param clientSdkKey
   *   The client Sdk Key .
   * @param flagKeys
   *   flag keys in array
   * @param identity
   *   user identity
   * @param attributes
   *   The initial user attributes.
   * @param options
   *   Optional configuration settings.
   * @return
   *   The new client instance.
   */
  export function initialize(clientSdkKey: string, user: ULUser, options?: ULOptions): ULClient;

  // This is @ignored because TypeDoc does not show default exports correctly. We'll just explain
  // the export situation in the comment for initialize().
  /** @ignore */
  const Unlaunch: {
    initialize: (envKey: string, user: ULUser, options?: ULOptions) => ULClient;
    version: string;
  };

  /** @ignore */ // see above
  export default Unlaunch;

  /**
   * Initialization options for the Unlaunch browser SDK.
   */
  export interface ULOptions extends ULOptionsBase {
    /**
     * The signed user key for Secure Mode.
     *
     * For more information, see the JavaScript SDK Reference Guide on
     * [Secure mode](https://docs.unlaunch.com/docs/js-sdk-reference#section-secure-mode).
     */
    hash?: string;

    /**
     * Whether the client should make a request to Unlaunch for A/B testing goals.
     *
     * This is true by default, meaning that this request will be made on every page load.
     * Set it to false if you are not using A/B testing and want to skip the request.
     */
    fetchGoals?: boolean;

    /**
     * A function which, if present, can change the URL in analytics events to something other
     * than the actual browser URL. It will be called with the current browser URL as a parameter,
     * and returns the value that should be stored in the event's `url` property.
     */
    eventUrlTransformer?: (url: string) => string;

    /**
     * If set to true, this prevents the SDK from trying to use a synchronous HTTP request to deliver
     * analytics events if the page is being closed. Not all browsers allow such requests; the SDK
     * normally tries to avoid making them if not allowed, by using browser detection, but sometimes
     * browser detection may not work so if you are seeing errors like "synchronous XHR request
     * during page dismissal", you may want to set this option. Since currently the SDK does not have
     * a better way to deliver events in this scenario, some events may be lost.
     */
    disableSyncEventPost?: boolean;
  }

  /**
   * The Unlaunch SDK client object.
   *
   * Applications should configure the client at page load time and reuse the same instance.
   *
   * For more information, see the [SDK Reference Guide](https://docs.unlaunch.com/docs/js-sdk-reference).
   */
  export interface ULClient extends ULClientBase {
    /**
     * Allows you to wait until the client has received goals data from Unlaunch.
     *
     * This is only relevant if you are using A/B testing features like click events and
     * pageview events; until the client has received the configuration for these (which
     * happens immediately after the initial request for feature flags), click events and
     * pageview events will not work, so you may wish to wait using this method before
     * doing anything that you expect to generate those events.
     *
     * The returned Promise will be resolved once the client has received goals data. If
     * you prefer to use event handlers rather than Promises, you can listen on the client
     * for a `"goalsReady"` event instead.
     * 
     * @returns
     *   A Promise containing the initialization state of the client.
     */
    waitUntilGoalsReady(): Promise<void>;
  }
}
