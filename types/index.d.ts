type LookupHandler = () => any | Promise<any>

export default class CachedLookup {

    /**
     * Constructs a cached lookup with the specified lookup handler.
     * 
     * @param lookup 
     */
    constructor(lookup: LookupHandler)

    /**
     * Returns cached value if the latest cache value is not older than the maximum age.
     * This message falls back to fetching a fresh value if most recent cached value is too old.
     *
     * @param {Number} max_age In Milliseconds
     */
    cached(max_age: number): Promise<any>;

    /**
     * Fetches a fresh value from the lookup handler and returns the result.
     */
    fresh(): Promise<any>;

    /**
     * Expires the current cached value.
     */
    expire(): void;

    /* CachedLookup Getters */

    /**
     * Returns most recent cached value for this lookup instance.
     */
    get value(): any;

    /**
     * Returns the milliseconds unix timestamp of the last cached value update.
     */
    get updated_at(): number;

    /**
     * Returns whether this instance is currently fetching a fresh value.
     */
    get in_flight(): boolean;
}