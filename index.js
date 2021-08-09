class CachedLookup {
    #cache_value;
    #cache_lifetime;
    #lookup_queue = [];
    #lookup_in_flight = false;
    #lookup_last_update = 0;
    #lookup_handler = () => {};

    constructor({ lifetime = 1000 }) {
        // Ensure lifetime parameter is a number type
        if (typeof lifetime !== 'number')
            throw new Error('lifetime must be a Number in milliseconds');
        this.#cache_lifetime = lifetime;
    }

    /**
     * Binds a lookup handler that is called whenever a fresh value must be fetched after cache has expired.
     *
     * @param {Function} handler
     */
    set_lookup_handler(handler) {
        // Ensure handler is a function type
        if (typeof handler !== 'function')
            throw new Error('set_lookup_handler(handler) -> handler must be a Function');
        this.#lookup_handler = handler;
    }

    /**
     * Returns whether cache is still valid or expired.
     *
     * @returns {Boolean}
     */
    _is_cache_valid() {
        let value = this.#cache_value;
        let last_update = this.#lookup_last_update;
        return value && Date.now() - last_update < this.#cache_lifetime;
    }

    /**
     * Flushes all queued handlers based on specified index and resets queue to empty.
     *
     * @param {*} value
     * @param {*} index
     */
    _flush_queue(value, index) {
        this.#lookup_queue.forEach((handlers) => handlers[index](value));
        this.#lookup_queue = [];
    }

    /**
     * Performs a lookup for value and queues when a lookup is already in flight.
     *
     * @param {Arguments} args
     * @param {Function} resolve
     * @param {Function} reject
     * @returns
     */
    _lookup(args, resolve, reject) {
        // If instance is in flight, queue the lookup request
        if (this.#lookup_in_flight === true) return this.#lookup_queue.push([resolve, reject]);

        // Mark instance as in flight causing all further lookups to be queued
        this.#lookup_in_flight = true;

        // Perform lookup by calling lookup handler set by user
        let reference = this;
        this.#lookup_handler(...args)
            .then((result) => {
                // Cache new lookup result and flush queue
                reference.#cache_value = result;
                reference.#lookup_last_update = Date.now();
                reference._flush_queue(result, 0);
                if (resolve) resolve(result);
            })
            .catch((error) => {
                // Reject all queued handlers and caller with rejection error
                reference._flush_queue(error, 1);
                if (reject) reject(error);
            })
            .finally(() => {
                // Mark instance as no longer in flight
                reference.#lookup_in_flight = false;
            });
    }

    /**
     * Resolves cached or fresh value depending on internal cache state.
     * Note any parameters defined for this method are passed onto the lookup handler.
     *
     * @returns {Any}
     */
    get() {
        let args = arguments;
        let reference = this;
        return new Promise(async (resolve, reject) => {
            // Hit local cache first and resolve immediately
            if (reference._is_cache_valid()) return reference.#cache_value;

            // Perform a fresh lookup to update cache
            reference._lookup(args, resolve, reject);
        });
    }

    /* CachedLookup Getters */
    get cached_value() {
        return this.#cache_value;
    }

    get last_update() {
        return this.#lookup_last_update;
    }

    get in_flight() {
        return this.#lookup_in_flight;
    }
}

module.exports = CachedLookup;
