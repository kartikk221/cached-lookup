class CachedLookup {
    #lookup;
    #value;
    #promise;
    #updated_at = 0;

    constructor(lookup) {
        // Ensure lookup is a function type
        if (typeof lookup !== 'function') throw new Error('new CachedLookup(lookup) -> lookup must be a Function');
        this.#lookup = lookup;
    }

    /**
     * Returns whether current cache value is valid or not based on provided age in milliseconds.
     *
     * @private
     * @param {Number} max_age In Milliseconds
     * @returns {Boolean}
     */
    _is_cache_valid(max_age) {
        return this.#updated_at + max_age > Date.now();
    }

    /**
     * Cached the provided value and renews the cache availability.
     * @private
     */
    _cache_value(value) {
        this.#value = value;
        this.#promise = undefined;
        this.#updated_at = Date.now();
    }

    /**
     * Returns cached value if the cached value is not older than the specified maximum age in milliseconds.
     * This method automatically retrieves a fresh value if the cached value is older than the specified maximum age.
     *
     * @param {Number} max_age In Milliseconds
     * @returns {Promise}
     */
    cached(max_age) {
        // Ensure max_age is a valid greater than zero number
        if (typeof max_age !== 'number' || max_age < 0)
            throw new Error('CachedLookup.cached(max_age) -> max_age must be a number that is greater than zero.');

        // Return value from cache if it is still valid
        if (this._is_cache_valid(max_age)) return Promise.resolve(this.#value);

        // Initiate a lookup for a fresh value
        return this.fresh();
    }

    /**
     * Fetches a fresh value from the lookup handler and returns result.
     * @returns {Promise}
     */
    fresh() {
        // Return a pending promise if one exists for an in flight lookup
        if (this.#promise) return this.#promise;

        // Create a new promise for the lookup operation and cache it locally
        const scope = this;
        this.#promise = new Promise(async (resolve, reject) => {
            // Safely execute lookup handler to retrieve an output value
            let output;
            try {
                output = await scope.#lookup();
            } catch (error) {
                // Reject the error from the lookup operation
                return reject(error);
            }

            // Cache the output value and resolve the promise
            scope._cache_value(output);
            resolve(output);
        });

        return this.#promise;
    }

    /**
     * Expires the current cached value marking the instance to retrieve a fresh value on next call.
     */
    expire() {
        this.#updated_at = 0;
    }

    /* CachedLookup Getters */

    /**
     * Returns most recently cached value for this lookup instance.
     */
    get value() {
        return this.#value;
    }

    /**
     * Returns the milliseconds unix timestamp of the last cached value update.
     * @returns {Number}
     */
    get updated_at() {
        return this.#updated_at;
    }

    /**
     * Returns whether this instance is currently fetching a fresh value.
     * @returns {Boolean}
     */
    get in_flight() {
        return this.#promise instanceof Promise;
    }
}

module.exports = CachedLookup;
