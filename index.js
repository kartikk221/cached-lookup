/**
 * @template T
 */
class CachedLookup {
    #lookup;
    #cache = {};
    #promises = {};

    /**
     * @typedef {Boolean|Number|String} SupportedArgumentTypes
     */

    /**
     * @typedef {Object} ValueRecord
     * @property {T} value
     * @property {Number} updated_at
     */

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {function(...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)):T} lookup
     */
    constructor(lookup) {
        // Ensure lookup is a function type
        if (typeof lookup !== 'function') throw new Error('new CachedLookup(lookup) -> lookup must be a Function.');
        this.#lookup = lookup;
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
        const record = this.#cache[identifier];

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

        // Initialize the record structure for the specified arguments if it does not exist
        if (!this.#cache[identifier])
            this.#cache[identifier] = {
                value: null,
                updated_at: null,
            };

        // Fill the record values with the provided value and current timestamp
        this.#cache[identifier].value = value;
        this.#cache[identifier].updated_at = Date.now();
    }

    /**
     * Retrieves a fresh value from the lookup and returns result.
     *
     * @private
     * @param {Array<SupportedArgumentTypes>} args
     * @returns {Promise<T>}
     */
    _get_fresh_value(args) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(args);

        // Resolve an existing promise for the specified arguments if it exists
        if (this.#promises[identifier]) return this.#promises[identifier];

        // Initialize a new promise which will be resolved when the value is resolved
        const reference = this;
        this.#promises[identifier] = new Promise(async (resolve, reject) => {
            // Attempt to resolve the value for the specified arguments from the lookup
            let value;
            try {
                value = await reference.#lookup(...args);
            } catch (error) {
                return reject(error);
            }

            // Store the resolved value in the cache for the specified arguments
            reference._set_cache(args, value);

            // Resolve the promise with the resolved value
            resolve(value);

            // Cleanup the promise for the specified arguments
            delete reference.#promises[identifier];
        });

        // Return the promise to the caller
        return this.#promises[identifier];
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
        // Ensure max_age is a valid greater than zero number
        if (typeof max_age !== 'number' || max_age < 0)
            throw new Error('CachedLookup.cached(max_age) -> max_age must be a number that is greater than zero.');

        // Retrieve a serialized Array of arguments ignoring the first argument (max_age)
        const serialized = Array.from(arguments).slice(1);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_cache(serialized, max_age);
        if (record) return Promise.resolve(record.value);

        // Resolve the fresh value for the provided arguments in array serialization
        return this._get_fresh_value(serialized);
    }

    /**
     * Returns a fresh value and automatically updates the internal cache with this value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    fresh(...args) {
        // Serialize the arguments into an Array
        const serialized = Array.from(arguments);

        // Resolve the fresh value for the provided serialized arguments
        return this._get_fresh_value(serialized);
    }

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Boolean} True if the cache value was expired, false otherwise.
     */
    expire(...args) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(Array.from(arguments));

        // Remove the cached value record for the specified arguments
        if (this.#cache[identifier]) {
            delete this.#cache[identifier];
            return true;
        }
        return false;
    }

    /**
     * Returns whether a fresh value is currently being resolved for the provided set of arguments.
     *
     * @param {...(SupportedArgumentTypes|Array<SupportedArgumentTypes>)} args
     * @returns {Boolean}
     */
    in_flight(...args) {
        // Retrieve the identifier string for the provided arguments
        const identifier = this._arguments_to_identifier(Array.from(arguments));

        // Return true if there is a promise for the specified arguments
        return this.#promises[identifier] !== undefined;
    }

    /* CachedLookup Getters */

    /**
     * Returns the underlying cache object which contains the cached values identified by their serialized arguments.
     *
     * @returns {Map<String, ValueRecord>}
     */
    get cache() {
        return this.#cache;
    }
}

module.exports = CachedLookup;
