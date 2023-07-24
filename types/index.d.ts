type LookupHandler<T, Args extends any[]> = (...args: Args) => T | Promise<T>;
type SupportedTypes = string | number | boolean;
type Argument = SupportedTypes | SupportedTypes[];

interface ValueRecord<T = unknown> {
    value: T;
    updated_at: number;
}

interface ConstructorOptions {
    auto_purge?: boolean;
    purge_age_factor?: number;
}

/**
 * Class representing a Cached Lookup
 * @template T The type of data stored in the cache
 * @template Args The types of arguments for the lookup function
 */
export default class CachedLookup<T, Args extends Argument[] = Argument[]> {
    /**
     * @type {LookupHandler<T, Args>} lookup The lookup function used to resolve fresh values
     */
    lookup: LookupHandler<T, Args>;

    /**
     * @type {Map<string, ValueRecord<T>>} cache Map storing the cached values
     */
    cache: Map<string, ValueRecord<T>>;

    /**
     * @type {Map<string, Promise<T>>} promises Map storing the in-flight promises for any pending lookup calls
     */
    promises: Map<string, Promise<T>>;

    /**
     * Constructor for CachedLookup class
     * @param {LookupHandler<T, Args>} lookup The lookup function
     */
    constructor(lookup: LookupHandler<T, Args>);

    /**
     * Constructor for CachedLookup class
     * @param {ConstructorOptions} options The constructor options
     * @param {LookupHandler<T, Args>} lookup The lookup function
     */
    constructor(options: ConstructorOptions, lookup: LookupHandler<T, Args>);

    /**
     * Returns a cached value that is up to max_age milliseconds old when available and falls back to a fresh value if not.
     * @param {number} max_age The maximum age of the cached data
     * @param {...Args} args The arguments for the lookup function
     * @returns {Promise<T>}
     */
    cached(max_age: number, ...args: Args): Promise<T>;

    /**
     * Returns a cached value that is around max_age milliseconds old when available and instantly resolves the most recently cached value while also updating the cache with a fresh value in the background.
     * @param {number} max_age The maximum age of the cached data
     * @param {...Args} args The arguments for the lookup function
     * @returns {Promise<T>}
     */
    rolling(max_age: number, ...args: Args): Promise<T>;

    /**
     * Returns a fresh value for the provided arguments.
     * @param {...Args} args The arguments for the lookup function
     * @returns {Promise<T>}
     */
    fresh(...args: Args): Promise<T>;

    /**
     * Expires the cached value for the provided set of arguments.
     * @param {...Args} args The arguments for the lookup function
     * @returns {boolean} True if the cache value was expired, false otherwise
     */
    expire(...args: Args): boolean;

    /**
     * Returns whether a fresh value is currently being resolved for the provided set of arguments.
     * @param {...Args} args The arguments for the lookup function
     * @returns {boolean}
     */
    in_flight(...args: Args): boolean;

    /**
     * Returns the last value update timestamp in milliseconds for the provided set of arguments.
     * @param {...Args} args The arguments for the lookup function
     * @returns {number | undefined}
     */
    updated_at(...args: Args): number | undefined;

    /**
     * Clears all the cached values and resets the internal cache state.
     */
    clear(): void;
}
