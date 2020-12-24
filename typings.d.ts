/**
 * Basic UnLaunch JavaScript client interfaces, shared between the browser SDK and the Electron SDK.
 */
declare module 'unlaunch-js-sdk-common' {

  /**
   * The current version string of the SDK.
   */
  export const version: string;

  /**
   * The types of values a feature flag can have.
   *
   * Flags can have any JSON-serializable value.
   */
  export type ULFlagValue = any;

  /**
   * A map of feature flags from their keys to their values.
   */
  export interface ULFlagSet {
    [key: string]: ULFlagValue;
  }

  /**
   * A map of feature flag keys to objects holding changes in their values.
   */
  export interface ULFlagChangeset {
    [key: string]: {
      current: ULFlagValue;
      previous: ULFlagValue;
    };
  }

  /**
   * The minimal interface for any object that ULClient can use for logging.
   *
   * The client uses four log levels, with "error" being the most severe. Each corresponding
   * logger method takes a single string parameter. The logger implementation is responsible
   * for deciding whether to produce output or not based on the level.
   */
  export interface ULLogger {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  }

  /**
   * A basic implementation of logging that uses the global `console` object. This is used by
   * default in the browser SDK. It sends messages of "debug", "info", "warn", or "error"
   * level (if enable) to `console.log()`, `console.info()`, `console.warn()`, and `console.error()`
   * respectively.
   *
   * To make ULClient use this logger, put it in the `logger` property of [[ULOptions]].
   */
  export function createConsoleLogger(minimumLevel: string): ULLogger;

  /**
   * Unlaunch initialization options that are supported by all variants of the JS client.
   * The browser SDK and Electron SDK may support additional options.
   *
   * @ignore (don't need to show this separately in TypeDoc output; all properties will be shown in ULOptions)
   */
  export interface ULOptionsBase {
    /**
     * An object that will perform logging for the client.
     *
     * If not specified, the default is [[createConsoleLogger]] in the browser SDK, or a logger
     * from the `winston` package in Electron.
     */
    logger?: ULLogger;

    /**
     * The initial set of flags to use until the remote set is retrieved.
     *
     * If `"localStorage"` is specified, the flags will be saved and retrieved from browser local
     * storage. Alternatively, an [[ULFlagSet]] can be specified which will be used as the initial
     * source of flag values. In the latter case, the flag values will be available via [[variation]]
     * immediately after calling `initialize()` (normally they would not be available until the
     * client signals that it is ready).
     *
     * For more information, see the [SDK Reference Guide](https://docs.unlaunch.com/docs/js-sdk-reference#section-bootstrapping).
     */
    bootstrap?: 'localStorage' | ULFlagSet;

    /**
     * The base URL for the Unlaunch server.
     *
     * Most users should use the default value.
     */
    baseUrl?: string;

    /**
     * The base URL for the Unlaunch events server.
     *
     * Most users should use the default value.
     */
    eventsUrl?: string;

  
    /**
     * Whether or not to use the REPORT verb to fetch flag settings.
     *
     * If this is true, flag settings will be fetched with a REPORT request
     * including a JSON entity body with the user object.
     *
     * Otherwise (by default) a GET request will be issued with the user passed as
     * a base64 URL-encoded path parameter.
     *
     * Do not use unless advised by Unlaunch.
     */
    useReport?: boolean;

    /**
     * Whether or not to include custom HTTP headers when requesting flags from Unlaunch.
     *
     * Currently these are used to track what version of the SDK is active. This defaults to true
     * (custom headers will be sent). One reason you might want to set it to false is that the presence
     * of custom headers causes browsers to make an extra OPTIONS request (a CORS preflight check)
     * before each flag request, which could affect performance.
     */
    sendULHeaders?: boolean;

    /**
     * Whether Unlaunch should provide additional information about how flag values were
     * calculated.
     *
     * The additional information will then be available through the client's
     * [[ULClient.variationDetail]] method. Since this increases the size of network requests,
     * such information is not sent unless you set this option to true.
     */
    evaluationReasons?: boolean;

    /**
     * Whether to send analytics events back to Unlaunch. By default, this is true.
     */
    sendEvents?: boolean;
    
    /**
     * Whether all user attributes (except the user key) should be marked as private, and
     * not sent to Unlaunch in analytics events.
     *
     * By default, this is false.
     */
    allAttributesPrivate?: boolean;

    /**
     * The names of user attributes that should be marked as private, and not sent
     * to Unlaunch in analytics events. You can also specify this on a per-user basis
     * with [[ULUser.privateAttributeNames]].
     */
    privateAttributeNames?: Array<string>;

    /**
     * Whether or not to send an analytics event for a flag evaluation even if the same flag was
     * evaluated with the same value within the last five minutes.
     *
     * By default, this is false (duplicate events within five minutes will be dropped).
     */
    allowFrequentDuplicateEvents?: boolean;

    /**
     * Whether analytics events should be sent only when you call variation (true), or also when you
     * call allFlags (false).
     *
     * By default, this is false (events will be sent in both cases).
     */
    sendEventsOnlyForVariation?: boolean;

    /**
     * The capacity of the analytics events queue.
     * 
     * The client buffers up to this many events in memory before flushing. If the capacity is exceeded
     * before the queue is flushed, events will be discarded. Increasing the capacity means that events
     * are less likely to be discarded, at the cost of consuming more memory. Note that in regular usage
     * flag evaluations do not produce individual events, only summary counts, so you only need a large
     * capacity if you are generating a large number of click, pageview, or identify events (or if you
     * are using the event debugger).
     * 
     * The default value is 100.
     */
    eventCapacity?: number;

    /**
     * The interval in between flushes of the analytics events queue, in milliseconds.
     *
     * The default value is 2000ms.
     */
    flushInterval?: number;

    /**
     * If specified, enables event sampling so that only some fraction of analytics events will be
     * sent pseudo-randomly.
     *
     * When set to greater than zero, there is a 1 in `samplingInterval` chance that events will be
     * sent: for example, a value of 20 means that on average 1 in 20, or 5%, of all events will be sent.
     *
     * @deprecated This feature will be removed in a future version.
     */
    samplingInterval?: number;
  
  }

  /**
   * A Unlaunch user object.
   */
  export interface ULUser {
    /**
     * A unique string identifying a user.
     *
     * If you omit this property, and also set `anonymous` to `true`, the SDK will generate a UUID string
     * and use that as the key; it will attempt to persist that value in local storage if possible so the
     * next anonymous user will get the same key, but if local storage is unavailable then it will
     * generate a new key each time you specify the user.
     *
     * It is an error to omit the `key` property if `anonymous` is not set.
     */
    key?: string;

    /**
     * An optional secondary key for a user. This affects
     * [feature flag targeting](https://docs.unlaunch.com/docs/targeting-users#section-targeting-rules-based-on-user-attributes)
     * as follows: if you have chosen to bucket users by a specific attribute, the secondary key (if set)
     * is used to further distinguish between users who are otherwise identical according to that attribute.
     */
    secondary?: string;

    /**
     * The user's name.
     *
     * You can search for users on the User page by name.
     */
    name?: string;

    /**
     * The user's first name.
     */
    firstName?: string;

    /**
     * The user's last name.
     */
    lastName?: string;

    /**
     * The user's email address.
     *
     * If an `avatar` URL is not provided, Unlaunch will use Gravatar
     * to try to display an avatar for the user on the Users page.
     */
    email?: string;

    /**
     * An absolute URL to an avatar image for the user.
     */
    avatar?: string;

    /**
     * The user's IP address.
     */
    ip?: string;

    /**
     * The country associated with the user.
     */
    country?: string;

    /**
     * Whether to show the user on the Users page in Unlaunch.
     */
    anonymous?: boolean;

    /**
     * Any additional attributes associated with the user.
     */
    custom?: {
      [key: string]: string | boolean | number | Array<string | boolean | number>;
    };

    /**
     * Specifies a list of attribute names (either built-in or custom) which should be
     * marked as private, and not sent to Unlaunch in analytics events. This is in
     * addition to any private attributes designated in the global configuration
     * with [[ULOptions.privateAttributeNames]] or [[ULOptions.allAttributesPrivate]].
     */
    privateAttributeNames?: Array<string>;
  }

  /**
   * Describes the reason that a flag evaluation produced a particular value. This is
   * part of the [[ULEvaluationDetail]] object returned by [[ULClient.variationDetail]].
   * 
   * This type is separate from `[[ULEvaluationReason]]` for backwards compatibility. In 
   * earlier versions of this SDK, `[[ULEvaluationReason]]` was incorrectly defined as 
   * being non-nullable.
   */
  interface NonNullableULEvaluationReason {
    /**
     * The general category of the reason:
     *
     * - `'OFF'`: The flag was off and therefore returned its configured off value.
     * - `'FALLTHROUGH'`: The flag was on but the user did not match any targets or rules.
     * - `'TARGET_MATCH'`: The user key was specifically targeted for this flag.
     * - `'RULE_MATCH'`: the user matched one of the flag's rules.
     * - `'PREREQUISITE_FAILED'`: The flag was considered off because it had at least one
     *   prerequisite flag that either was off or did not return the desired variation.
     * - `'ERROR'`: The flag could not be evaluated, e.g. because it does not exist or due
     *   to an unexpected error.
     */
    kind: string;

    /**
     * A further description of the error condition, if the kind was `'ERROR'`.
     */
    errorKind?: string;

    /**
     * The index of the matched rule (0 for the first), if the kind was `'RULE_MATCH'`.
     */
    ruleIndex?: number;

    /**
     * The unique identifier of the matched rule, if the kind was `'RULE_MATCH'`.
     */
    ruleId?: string;

    /**
     * The key of the failed prerequisite flag, if the kind was `'PREREQUISITE_FAILED'`.
     */
    prerequisiteKey?: string;
  }

  /**
   * Describes the reason that a flag evaluation produced a particular value. This is
   * part of the [[ULEvaluationDetail]] object returned by [[ULClient.variationDetail]].
   * 
   * Will be null when `[[ULOptions.evaluationReasons]]` is `false`.
   */
  export type ULEvaluationReason = NonNullableULEvaluationReason | null;

  /**
   * An object that combines the result of a feature flag evaluation with information about
   * how it was calculated.
   *
   * This is the result of calling [[ULClient.variationDetail]].
   *
   * For more information, see the [SDK reference guide](https://docs.unlaunch.com/docs/evaluation-reasons).
   */
  export interface ULEvaluationDetail {
    /**
     * The result of the flag evaluation. This will be either one of the flag's variations or
     * the default value that was passed to [[ULClient.variationDetail]].
     */
    value: ULFlagValue;

    /**
     * The index of the returned value within the flag's list of variations, e.g. 0 for the
     * first variation-- or `null` if the default value was returned.
     */
    variationIndex?: number;

    /**
     * An object describing the main factor that influenced the flag evaluation value.
     */
    reason: ULEvaluationReason;
  }

  /**
   * The basic interface for the Unlaunch client. The browser SDK and the Electron SDK both
   * use this, but may add some methods of their own.
   *
   * @see http://docs.unlaunch.com/docs/js-sdk-reference
   *
   * @ignore (don't need to show this separately in TypeDoc output; all methods will be shown in ULClient)
   */
  export interface ULClientBase {
    /**
     * Returns a Promise that tracks the client's initialization state.
     *
     * The returned Promise will be resolved once the client has either successfully initialized
     * or failed to initialize (e.g. due to an invalid environment key or a server error). It will
     * never be rejected.
     *
     * ```
     *     // using a Promise then() handler
     *     client.waitUntilReady().then(() => {
     *         doSomethingWithClient();
     *     });
     *
     *     // using async/await
     *     await client.waitUntilReady();
     *     doSomethingWithClient();
     * ```
     *
     * If you want to distinguish between these success and failure conditions, use
     * [[waitForInitialization]] instead.
     * 
     * If you prefer to use event listeners ([[on]]) rather than Promises, you can listen on the
     * client for a `"ready"` event, which will be fired in either case.
     * 
     * @returns
     *   A Promise that will be resolved once the client is no longer trying to initialize.
     */
    waitUntilReady(): Promise<void>;

    /**
     * Returns a Promise that tracks the client's initialization state.
     *
     * The Promise will be resolved if the client successfully initializes, or rejected if client
     * initialization has irrevocably failed (for instance, if it detects that the SDK key is invalid).
     *
     * ```
     *     // using Promise then() and catch() handlers
     *     client.waitForInitialization().then(() => {
     *         doSomethingWithSuccessfullyInitializedClient();
     *     }).catch(err => {
     *         doSomethingForFailedStartup(err);
     *     });
     *
     *     // using async/await
     *     try {
     *         await client.waitForInitialization();
     *         doSomethingWithSuccessfullyInitializedClient();
     *     } catch (err) {
     *         doSomethingForFailedStartup(err); 
     *     }
     * ```
     *
     * It is important that you handle the rejection case; otherwise it will become an unhandled Promise
     * rejection, which is a serious error on some platforms. The Promise is not created unless you
     * request it, so if you never call `waitForInitialization()` then you do not have to worry about
     * unhandled rejections.
     *
     * Note that you can also use event listeners ([[on]]) for the same purpose: the event `"initialized"`
     * indicates success, and `"failed"` indicates failure.
     * 
     * @returns
     *   A Promise that will be resolved if the client initializes successfully, or rejected if it
     *   fails.
     */
    waitForInitialization(): Promise<void>;

    /**
     * Identifies a user to Unlaunch.
     *
     * Unlike the server-side SDKs, the client-side JavaScript SDKs maintain a current user state,
     * which is set at initialization time. You only need to call `identify()` if the user has changed
     * since then.
     *
     * Changing the current user also causes all feature flag values to be reloaded. Until that has
     * finished, calls to [[variation]] will still return flag values for the previous user. You can
     * use a callback or a Promise to determine when the new flag values are available.
     *
     * @param user
     *   The user properties. Must contain at least the `key` property.
     * @param hash
     *   The signed user key if you are using [Secure Mode](http://docs.unlaunch.com/docs/js-sdk-reference#secure-mode).
     * @param onDone
     *   A function which will be called as soon as the flag values for the new user are available,
     *   with two parameters: an error value (if any), and an [[ULFlagSet]] containing the new values
     *   (which can also be obtained by calling [[variation]]). If the callback is omitted, you will
     *   receive a Promise instead.
     * @returns
     *   If you provided a callback, then nothing. Otherwise, a Promise which resolve once the flag
     *   values for the new user are available, providing an [[ULFlagSet]] containing the new values
     *   (which can also be obtained by calling [[variation]]).
     */
    identify(user: ULUser, hash?: string, onDone?: (err: Error | null, flags: ULFlagSet | null) => void): Promise<ULFlagSet>;

    /**
     * Returns the client's current user.
     *
     * This is the user that was most recently passed to [[identify]], or, if [[identify]] has never
     * been called, the initial user specified when the client was created.
     */
    getUser(): ULUser;

    /**
     * Flushes all pending analytics events.
     *
     * Normally, batches of events are delivered in the background at intervals determined by the
     * `flushInterval` property of [[ULOptions]]. Calling `flush()` triggers an immediate delivery.
     *
     * @param onDone
     *   A function which will be called when the flush completes. If omitted, you
     *   will receive a Promise instead.
     *
     * @returns
     *   If you provided a callback, then nothing. Otherwise, a Promise which resolves once
     *   flushing is finished. Note that the Promise will be rejected if the HTTP request
     *   fails, so be sure to attach a rejection handler to it.
     */
    flush(onDone?: () => void): Promise<void>;

    /**
     * Determines the variation of a feature flag for the current user.
     *
     * In the client-side JavaScript SDKs, this is always a fast synchronous operation because all of
     * the feature flag values for the current user have already been loaded into memory.
     *
     * @param key
     *   The unique key of the feature flag.
     * @param defaultValue
     *   The default value of the flag, to be used if the value is not available from Unlaunch.
     * @returns
     *   The flag's value.
     */
    variation(key: string, defaultValue?: ULFlagValue): ULFlagValue;

    /**
     * Determines the variation of a feature flag for a user, along with information about how it was
     * calculated.
     *
     * Note that this will only work if you have set `evaluationExplanations` to true in [[ULOptions]].
     * Otherwise, the `reason` property of the result will be null.
     *
     * The `reason` property of the result will also be included in analytics events, if you are
     * capturing detailed event data for this flag.
     *
     * For more information, see the [SDK reference guide](https://docs.unlaunch.com/docs/evaluation-reasons).
     *
     * @param key
     *   The unique key of the feature flag.
     * @param defaultValue
     *   The default value of the flag, to be used if the value is not available from Unlaunch.
     *
     * @returns
     *   An [[ULEvaluationDetail]] object containing the value and explanation.
     */
    variationDetail(key: string, defaultValue?: ULFlagValue): ULEvaluationDetail;

    /**
     * Registers an event listener.
     *
     * The following event names (keys) are used by the cliet:
     *
     * - `"ready"`: The client has finished starting up. This event will be sent regardless
     *   of whether it successfully connected to Unlaunch, or encountered an error
     *   and had to give up; to distinguish between these cases, see below.
     * - `"initialized"`: The client successfully started up and has valid feature flag
     *   data. This will always be accompanied by `"ready"`.
     * - `"failed"`: The client encountered an error that prevented it from connecting to
     *   Unlaunch, such as an invalid environment ID. All flag evaluations will
     *   therefore receive default values. This will always be accompanied by `"ready"`.
     * - `"error"`: General event for any kind of error condition during client operation.
     *   The callback parameter is an Error object. If you do not listen for "error"
     *   events, then the errors will be logged with `console.log()`.
        
     *
     * @param key
     *   The name of the event for which to listen.
     * @param callback
     *   The function to execute when the event fires. The callback may or may not
     *   receive parameters, depending on the type of event; see [[ULEventSignature]].
     * @param context
     *   The `this` context to use for the callback.
     */
    on(key: string, callback: (...args: any[]) => void, context?: any): void;

    /**
     * Deregisters an event listener. See [[on]] for the available event types.
     *
     * @param key
     *   The name of the event for which to stop listening.
     * @param callback
     *   The function to deregister.
     * @param context
     *   The `this` context for the callback, if one was specified for [[on]].
     */
    off(key: string, callback: (...args: any[]) => void, context?: any): void;

    /**
     * Track page events to use in goals or A/B tests.
     *
     * Unlaunch automatically tracks pageviews and clicks that are specified in the
     * Goals section of their dashboard. This can be used to track custom goals or other
     * events that do not currently have goals.
     *
     * @param key
     *   The name of the event, which may correspond to a goal in A/B tests.
     * @param data
     *   Additional information to associate with the event.
     * @param metricValue
     *   An optional numeric value that can be used by the Unlaunch experimentation
     *   feature in numeric custom metrics. Can be omitted if this event is used by only
     *   non-numeric metrics. This field will also be returned as part of the custom event
     *   for Data Export.
     */
    track(key: string, data?: any, metricValue?: number): void;

    /**
     * Returns a map of all available flags to the current user's values.
     *
     * @returns
     *   An object in which each key is a feature flag key and each value is the flag value.
     *   Note that there is no way to specify a default value for each flag as there is with
     *   [[variation]], so any flag that cannot be evaluated will have a null value.
     */
    allFlags(): ULFlagSet;

   /**
    * Shuts down the client and releases its resources, after delivering any pending analytics
    * events. After the client is closed, all calls to [[variation]] will return default values,
    * and it will not make any requests to Unlaunch.
    *
    * @param onDone
    *   A function which will be called when the operation completes. If omitted, you
    *   will receive a Promise instead.
    *
    * @returns
    *   If you provided a callback, then nothing. Otherwise, a Promise which resolves once
    *   closing is finished. It will never be rejected.
    */
   close(onDone?: () => void): Promise<void>;
  }
}
