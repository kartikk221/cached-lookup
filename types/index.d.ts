type LookupHandler<T extends unknown> = () => T | Promise<T>;
type SupportedTypes = string | number | boolean;

interface ValueRecord<T = unknown> {
    value: T;
    updated_at: number;
}

interface ConstructorOptions {
    auto_purge?: boolean;
    purge_age_factor?: number;
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
     * @param {LookupHandler} [lookup] - The lookup function if the first argument is the constructor options.
     */
    constructor(lookup: LookupHandler<T>);

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {ConstructorOptions} [options] - The constructor options.
     * @param {LookupHandler} [lookup] - The lookup function if the first argument is the constructor options.
     */
    constructor(options: ConstructorOptions, lookup: LookupHandler<T>);

    /**
     * Returns a `cached` value that is up to `max_age` milliseconds old when available and falls back to a fresh value if not.
     * Use this method over `rolling` if you want to guarantee that the cached value is up to `max_age` milliseconds old at the sacrifice of increased latency whenever a `fresh` value is required.
     *
     * @param {Number} max_age In Milliseconds
     * @param {Array<SupportedTypes>} args
     * @returns {Promise<T>}
     */
    cached(max_age: number, ...args: SupportedTypes[]): Promise<T>;

    /**
     * Returns a `cached` value that is around `max_age` milliseconds old when available and instantly resolves the most recently `cached` value while also updating the cache with a fresh value in the background.
     * Use this method over `cached` if you want low latency at the sacrifice of a guaranteed age of the cached value.
     *
     * @param {Number} max_age In Milliseconds
     * @param {Array<SupportedTypes>} args
     * @returns {Promise<T>}
     */
    rolling(max_age: number, ...args: SupportedTypes[]): Promise<T>;

    /**
     * Returns a fresh value for the provided arguments.
     * Note! This method will automatically update the internal cache with the fresh value.
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
