class CachedLookup {
    #lifetime;
    #handler;
    #value;
    #expires_at;
    #promise;

    /**
     * Creates a CachedLookup instance
     * @param {Number} lifetime Lifetime of the cache in milliseconds
     * @param {Function} handler Lookup handler which will be called to get fresh value
     */
    constructor(lifetime, handler) {
        // Ensure lifetime is a number in milliseconds
        if (typeof lifetime !== 'number' || lifetime < 1)
            throw new Error(
                'CachedLookup(lifetime, handler) -> lifetime must be a number in milliseconds'
            );

        // Ensure handler is a function
        if (typeof handler !== 'function')
            throw new Error('CachedLookup(lifetime, handler) -> handler must be a function');

        // Store lifetime and handler
        this.#lifetime = lifetime;
        this.#handler = handler;
    }

    /**
     * Returns whether last retrieved cache value is still valid.
     * @private
     * @returns {Boolean}
     */
    _is_cache_valid() {
        return this.#value && this.#expires_at && this.#expires_at > Date.now();
    }

    /**
     * @private
     * Increments cache expiry timestamp and cleans up shared promise.
     */
    _increment_cache() {
        // Extend cache expired_at timestamp and cleanup promise
        this.#expires_at = Date.now() + this.#lifetime;
        this.#promise = null;
    }

    /**
     * Returns cached or fresh value from instance depending on cache status
     * @returns {Promise}
     */
    get() {
        // Return value from cache if it is still valid
        if (this._is_cache_valid()) return Promise.resolve(this.#value);

        // Return pending promise if one exists for an in_flight lookup
        if (this.#promise) return this.#promise;

        // Create a new promise for the lookup operation and cache it
        const reference = this;
        this.#promise = new Promise((resolve, reject) => {
            // Safely execute handler to retrieve promise
            let output;
            try {
                output = reference.#handler();
            } catch (error) {
                return reject(error);
            }

            // Bind a then/catch to the returned promise as it is an asynchronous operation with pending result
            if (output instanceof Promise) {
                output
                    .then((value) => {
                        // Resolve returned value and increment cache
                        reference.#value = value;
                        resolve(value);
                        reference._increment_cache();
                    })
                    .catch(reject);
            } else {
                // Resolve output instantly as it was a synchronous operation with an instant result
                reference.#value = output;
                resolve(output);
                reference._increment_cache();
            }
        });

        return this.#promise;
    }

    /**
     * Expires current cached value marking instance to fetch fresh value on next get operation.
     */
    expire() {
        this.#expires_at = 0;
    }

    /* CachedLookup Getters */
    get cached_value() {
        return this.#value;
    }

    get expires_at() {
        return this.#expires_at;
    }

    get in_flight() {
        return this.#promise instanceof Promise;
    }
}

module.exports = CachedLookup;
