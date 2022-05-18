type LookupHandler<T extends any> = () => T | Promise<T>
type SupportedTypes = string | number | boolean;
type SupportedArgumentTypes = SupportedTypes | SupportedTypes[];

interface ValueRecord {
    value: InstanceType<typeof CachedLookup>,
    updated_at: number
}

export default class CachedLookup<T extends any> {
    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {function(...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)):T} lookup
     */
    constructor(lookup: LookupHandler<T>)

    /**
     * Returns a cached value that is up to max_age milliseconds old for the provided set of arguments.
     * Falls back to a fresh value if the cache value is older than max_age.
     * 
     * @param {Number} max_age In Milliseconds
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Promise<T>}
     */
    cached(max_age: number, ...args: SupportedArgumentTypes[]): Promise<T>;

    /**
     * Returns a fresh value and automatically updates the internal cache with this value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Promise<T>}
     */
    fresh(...args: SupportedArgumentTypes[]): Promise<T>;

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Boolean} True if the cache value was expired, false otherwise.
     */
    expire(...args: SupportedArgumentTypes[]): boolean;

    /**
     * Returns whether a fresh value is currently being resolved for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Boolean}
     */
    in_flight(...args: SupportedArgumentTypes[]): boolean;

    /**
     * Returns the last value update timestamp in milliseconds for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Boolean}
     */
    updated_at(...args: SupportedArgumentTypes[]): number | void;

    /* CachedLookup Getters */

    /**
     * Returns the underlying cache object which contains the cached values identified by their serialized arguments.
     *
     * @returns {Map<String, ValueRecord>}
     */
    get cache(): Map<string, ValueRecord>;
}