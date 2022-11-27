type LookupHandler<T extends unknown> = () => T | Promise<T>;
type SupportedTypes = string | number | boolean;

interface ValueRecord<T = unknown> {
    value: T;
    updated_at: number;
}

export default class CachedLookup<T extends unknown> {
    /**
     * The lookup function that is used to resolve fresh values for the provided arguments.
     * @type {function(...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)):T|Promise<T>}
     */
    lookup: LookupHandler<T>;

    /**
     * Stores the cached values identified by the serialized arguments from lookup calls.
     * @type {Map<string, ValueRecord<T>>}
     */
    cache: Map<string, ValueRecord<T>>;

    /**
     * Stores the in-flight promises for any pending lookup calls identified by the serialized arguments.
     * @type {Map<string, Promise<T>>}
     */
    promises: Map<string, Promise<T>>;

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {LookupHandler<T>} lookup
     */
    constructor(lookup: LookupHandler<T>);

    /**
     * Returns a cached value that is up to max_age milliseconds old for the provided set of arguments.
     * Falls back to a fresh value if the cache value is older than max_age.
     *
     * @param {Number} max_age In Milliseconds
     * @param {Array<SupportedTypes>} args
     * @returns {Promise<T>}
     */
    cached(max_age: number, ...args: SupportedTypes[]): Promise<T>;

    /**
     * Returns a periodically refreshed value that is refreshed on a rolling basis based on the max_age.
     * Note! This method will return a cached value while the refresh is in progress allowing for lower latency compared to `cached()`.
     * As a last resort, a fresh value will be returned if no cache value is available.
     *
     * @param {Number} max_age In Milliseconds
     * @param {Array<SupportedTypes>} args
     * @returns {Promise<T>}
     */
    rolling(max_age: number, ...args: SupportedTypes[]): Promise<T>;

    /**
     * Returns a fresh value and automatically updates the internal cache with this value for the provided set of arguments.
     *
     * @param {Array<SupportedTypes>} args
     * @returns {Promise<T>}
     */
    fresh(...args: SupportedTypes[]): Promise<T>;

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {Array<SupportedTypes>} args
     * @returns {Boolean} True if the cache value was expired, false otherwise.
     */
    expire(...args: SupportedTypes[]): boolean;

    /**
     * Returns whether a fresh value is currently being resolved for the provided set of arguments.
     *
     * @param {Array<SupportedTypes>} args
     * @returns {Boolean}
     */
    in_flight(...args: SupportedTypes[]): boolean;

    /**
     * Returns the last value update timestamp in milliseconds for the provided set of arguments.
     *
     * @param {Array<SupportedTypes>} args
     * @returns {Boolean}
     */
    updated_at(...args: SupportedTypes[]): number | void;

    /**
     * Clears all the cached values and resets the internal cache state.
     */
    clear(): void;
}
