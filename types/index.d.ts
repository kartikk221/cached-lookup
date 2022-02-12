type LookupHandler<T extends any> = () => T | Promise<T>

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
     *
     * @param {Number} max_age In Milliseconds
     * @returns {Promise}
     */
    cached(max_age: number): Promise<T>;

    /**
     * Fetches a fresh value from the lookup handler and returns result.
     * @returns {Promise}
     */
    fresh(): Promise<T>;

    /**
     * Expires the current cached value marking the instance to retrieve a fresh value on next call.
     */
    expire(): void;

    /* CachedLookup Getters */

    /**
     * Returns most recently cached value for this lookup instance.
     */
    get value(): T;

    /**
     * Returns the milliseconds unix timestamp of the last cached value update.
     * @returns {Number}
     */
    get updated_at(): number;

    /**
     * Returns whether this instance is currently fetching a fresh value.
     * @returns {Boolean}
     */
    get in_flight(): boolean;
}