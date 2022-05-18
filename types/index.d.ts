type LookupHandler<T extends unknown> = () => T | Promise<T>;
type SupportedTypes = string | number | boolean;

interface ValueRecord<T = unknown> {
    value: T;
    updated_at: number;
}

export default class CachedLookup<T extends unknown> {
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

    /* CachedLookup Getters */

    /**
     * Returns the underlying cache object which contains the cached values identified by their serialized arguments.
     *
     * @returns {Map<String, ValueRecord<T>>}
     */
    get cache(): Map<string, ValueRecord<T>>;
}
