type LookupHandler<T extends any> = () => T | Promise<T>
type SupportedTypes = string | number | boolean;
type SupportedArgumentTypes = SupportedTypes | SupportedTypes[];

interface ValueRecord {
    value: T,
    updated_at: number
};

export default class CachedLookup<T extends any> {
    /**
     * Constructs a cached lookup with the specified lookup handler.
     * 
     * @param lookup 
     */
    constructor(lookup: LookupHandler<T>)

    /**
     * Returns cached value if the cached value is not older than the specified maximum age in milliseconds.
     * This method automatically retrieves a fresh value if the cached value is older than the specified maximum age.
     * Note! This method will differentiate between values for different sets of arguments.
     *
     * @param {Number} max_age In Milliseconds
     * @param {...(SupportedArgumentTypes} args
     * @returns {Promise<T>}
     */
    cached(max_age: number, ...args: SupportedArgumentTypes): Promise<T>;

    /**
     * Fetches a fresh value from the resolver and returns result.
     * Note! This method will pass all arguments to the resolver.
     *
     * @param {...(SupportedArgumentTypes)} args
     * @returns {Promise<T>}
     */
    fresh(...args: SupportedArgumentTypes): Promise<T>;

    /**
     * Expires the cache for the provided set of arguments.
     * @param {...(SupportedArgumentTypes)} args
     */
    expire(...args: SupportedArgumentTypes): void;

    /* CachedLookup Getters */

    /**
     * Returns the underlying cache object with all values for all sets of arguments.
     * @returns {Map<String, ValueRecord>}
     */
    get cache(): Map<string, ValueRecord>;
}