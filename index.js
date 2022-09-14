/**
 * @template T
 */
class CachedLookup {
    #max_ages = new Map();

    /**
     * @typedef {Boolean|Number|String} SupportedArgumentTypes
     */

    /**
     * @typedef {Object} ValueRecord
     * @property {T} value
     * @property {Number} timeout
     * @property {Number} updated_at
     */

    /**
     * The lookup function that is used to resolve fresh values for the provided arguments.
     * @type {function(...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)):T}
     */
    lookup;

    /**
     * Stores the cached values identified by the serialized arguments from lookup calls.
     * @type {Map<string, ValueRecord>}
     */
    cache = new Map();

    /**
     * Stores the in-flight promises for any pending lookup calls identified by the serialized arguments.
     * @type {Map<string, Promise<T>>}
     */
    promises = new Map();

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {function(...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)):T} lookup
     */
    constructor(lookup) {
        // Ensure lookup is a function type
        if (typeof lookup !== 'function') throw new Error('new CachedLookup(lookup) -> lookup must be a Function.');
        this.lookup = lookup;
    }

    /**
     * Returns an identifier string based on the provided array of arguments.
     *
     * @private
     * @param {Array<SupportedArgumentTypes>} args
     * @returns {String}
     */
    _arguments_to_identifier(args) {
        return args.join('');
    }

    /**
     * Retrieves the cached value record for the provided set of arguments.
     *
     * @private
     * @param {Array<SupportedArgumentTypes>} args
     * @param {Number} max_age
     * @returns {ValueRecord=}
     */
    _get_cache(args, max_age) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(args);

        // Attempt to lookup the value record for the specified arguments
        const record = this.cache.get(identifier);

        // Return the value record if it exists and is not older than the specified maximum age
        if (record && record.updated_at > Date.now() - max_age) return record;
    }

    /**
     * Sets the cached value record for the provided set of arguments and value.
     *
     * @private
     * @param {Array<SupportedArgumentTypes>} args
     * @param {T} value
     */
    _set_cache(args, value) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(args);

        // Schedule a timeout to remove the cached value record for the specified arguments
        let timeout;
        let max_age = this.#max_ages.get(identifier);
        if (max_age)
            timeout = setTimeout(
                (id, reference) => {
                    // Delete the cache record and max age for the specified arguments
                    reference.cache.delete(id);
                    reference.#max_ages.delete(id);
                },
                max_age,
                identifier,
                this
            );

        // Initialize the record structure for the specified arguments if it does not exist
        let record = this.cache.get(identifier);
        if (!record) {
            // Initialize the record structure for the specified arguments
            this.cache.set(identifier, {
                value,
                timeout,
                updated_at: Date.now(),
            });
        } else {
            // Clear the existing timeout for the cached value record
            if (record.timeout) clearTimeout(record.timeout);

            // Update the record structure for the specified arguments
            record.value = value;
            record.timeout = timeout;
            record.updated_at = Date.now();
        }
    }

    /**
     * Retrieves a fresh value from the lookup and returns result.
     *
     * @private
     * @param {Array<SupportedArgumentTypes>} args
     * @param {Number=} max_age
     * @returns {Promise<T>}
     */
    _get_fresh_value(args, max_age) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(args);

        // Resolve an existing promise for the specified arguments if it exists
        const existing = this.promises.get(identifier);
        if (existing) return existing;

        // Update the expiry for this serialized argument if greater than existing
        const old_max_age = this.#max_ages.get(identifier) || 0;
        if (max_age > old_max_age) this.#max_ages.set(identifier, max_age);

        // Initialize a new promise which will be resolved when the value is resolved
        const promise = new Promise(async (resolve, reject) => {
            // Attempt to resolve the value for the specified arguments from the lookup
            let value;
            try {
                value = await this.lookup(...args);
            } catch (error) {
                return reject(error);
            }

            // Store the resolved value in the cache for the specified arguments
            this._set_cache(args, value);

            // Resolve the promise with the resolved value
            resolve(value);

            // Cleanup the promise for the specified arguments
            this.promises.delete(identifier);
        });

        // Store the promise for the specified arguments
        this.promises.set(identifier, promise);

        // Return the promise to the caller
        return promise;
    }

    /**
     * Returns a cached value that is up to max_age milliseconds old for the provided set of arguments.
     * Falls back to a fresh value if the cache value is older than max_age.
     *
     * @param {Number} max_age In Milliseconds
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    cached(max_age, ...args) {
        // Ensure max_age is a valid number between 0 and maximum signed 32-bit integer
        if (typeof max_age !== 'number' || max_age < 0 || max_age > 2147483647)
            throw new Error(
                'CachedLookup.cached(max_age) -> max_age must be a number that is greater than zero but less than 2147483647 (setTimeout limit).'
            );

        // Retrieve a serialized Array of arguments ignoring the first argument (max_age)
        const serialized = Array.from(arguments).slice(1);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_cache(serialized, max_age);
        if (record) return Promise.resolve(record.value);

        // Resolve the fresh value for the provided arguments in array serialization
        return this._get_fresh_value(serialized, max_age);
    }

    /**
     * Returns a fresh value and automatically updates the internal cache with this value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    fresh(...args) {
        // Resolve the fresh value for the provided serialized arguments
        return this._get_fresh_value(Array.from(arguments));
    }

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Boolean} True if the cache value was expired, false otherwise.
     */
    expire(...args) {
        // Remove the cached value record for the specified arguments
        return this.cache.delete(this._arguments_to_identifier(Array.from(arguments)));
    }

    /**
     * Returns whether a fresh value is currently being resolved for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Boolean}
     */
    in_flight(...args) {
        // Return true if there is a promise for the specified arguments
        return this.promises.has(this._arguments_to_identifier(Array.from(arguments)));
    }

    /**
     * Returns the last value update timestamp in milliseconds for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Number=}
     */
    updated_at(...args) {
        // Return the updated_at timestamp for the specified arguments
        return this.cache.get(this._arguments_to_identifier(Array.from(arguments)))?.updated_at;
    }

    /**
     * Clears all the cached values and resets the internal cache state.
     */
    clear() {
        // Clear the cache
        this.cache.clear();
    }
}

module.exports = CachedLookup;
