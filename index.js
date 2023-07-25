const EventEmitter = require('events');

/**
 * The types of arguments that can be serialized on each call.
 * @typedef {boolean|number|string|null} SerializableArgumentTypes
 */

/**
 * @template T
 */
class CachedLookup extends EventEmitter {
    #delimiter = ',';
    #cleanup = {
        timeout: null,
        expected_at: null,
    };

    /**
     * @typedef {Object} CachedRecord
     * @property {T} value
     * @property {number=} max_age
     * @property {number} updated_at
     */

    /**
     * The acceptable argument types of the lookup function.
     * We allow Arrays of these types as well as they are automatically serialized.
     * @typedef {function(...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)):T|Promise<T>} LookupFunction
     */

    /**
     * CachedLookup constructor options.
     * @type {ConstructorOptions}
     */
    options;

    /**
     * The lookup function that is used to resolve fresh values for the provided arguments.
     * @type {LookupFunction}
     */
    lookup;

    /**
     * Stores the cached values identified by the serialized arguments from lookup calls.
     * @type {Map<string, CachedRecord>}
     */
    cache = new Map();

    /**
     * Stores the in-flight promises for any pending lookup calls identified by the serialized arguments.
     * @type {Map<string, Promise<T>>}
     */
    promises = new Map();

    /**
     * @typedef {Object} ConstructorOptions
     * @property {boolean} [auto_purge=true] - Whether to automatically purge cache values when they have aged past their last known maximum age.
     * @property {number} [purge_age_factor=1.5] - The factor by which to multiply the last known maximum age of a stale cache value to determine the age after which it should be purged from memory.
     * @property {number} [max_purge_eloop_tick=5000] - The number of items to purge from the cache per event loop tick. Decrease this value to reduce the impact of purging stale cache values on the event loop when working with many unique arguments.
     */

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {(LookupOptions|LookupFunction)} options - The constructor options or lookup function.
     * @param {LookupFunction} [lookup] - The lookup function if the first argument is the constructor options.
     */
    constructor(options, lookup) {
        super();

        // Ensure the options parameter is either the lookup function or an object.
        if (typeof options === 'function') {
            lookup = options;
        } else if (!options || typeof options !== 'object') {
            throw new Error('new CachedLookup(options, lookup) -> options must be an Object.');
        }

        // Ensure the lookup function always exists.
        if (typeof lookup !== 'function') {
            if (typeof options === 'function') {
                throw new Error('new CachedLookup(lookup) -> lookup must be a Function.');
            } else {
                throw new Error('new CachedLookup(options, lookup) -> lookup must be a Function.');
            }
        }

        // Store the lookup function and options
        this.lookup = lookup;
        this.options = Object.freeze({
            auto_purge: true, // By default automatically purge cache values when they have aged past their last known maximum age
            purge_age_factor: 1.5, // By default purge values that are one and half times their maximum age
            max_purge_eloop_tick: 5000, // By default purge 5000 items per event loop tick
            ...(typeof options === 'object' ? options : {}),
        });
    }

    /**
     * Returns an Array of arguments from a serialized string.
     * @private
     * @param {string} serialized
     * @returns {SerializableArgumentTypes[]}
     */
    _parse_arguments(serialized) {
        return serialized.split(this.#delimiter).map((arg) => {
            // Handle null values
            if (arg === 'null') return null;

            // Handle boolean values
            if (arg === 'true') return true;
            if (arg === 'false') return false;

            // Handle number values
            if (!isNaN(arg)) return Number(arg);

            // Handle string values
            return arg;
        });
    }

    /**
     * Reads the most up to date cached value record for the provided set of arguments if it exists and is not older than the specified maximum age.
     *
     * @private
     * @param {string} identifier
     * @param {number=} max_age
     * @returns {CachedRecord=}
     */
    _get_from_cache(identifier, max_age) {
        // Ensure the cached value record exists in the cache
        const record = this.cache.get(identifier);
        if (!record) return;

        // Schedule a cache cleanup for this entry if a max_age was provided
        if (max_age !== undefined) this._schedule_cache_cleanup(max_age);

        // Ensure the value is not older than the specified maximum age if provided
        if (max_age !== undefined && Date.now() - max_age > record.updated_at) return;

        // Update the record max_age if it is smaller than the provided max_age
        if (max_age !== undefined && max_age < (record.max_age || Infinity)) record.max_age = max_age;

        // Return the cached value record
        return record;
    }

    /**
     * Writes the provided value to the cache as the most up to date cached value for the provided set of arguments.
     *
     * @private
     * @param {string} identifier
     * @param {number=} max_age
     * @param {T} value
     */
    _set_in_cache(identifier, max_age, value) {
        const now = Date.now();

        // Retrieve the cached value record for this identifier from the cache
        const record = this.cache.get(identifier) || {
            value,
            max_age,
            updated_at: now,
        };

        // Update the record values
        record.value = value;
        record.updated_at = now;
        record.max_age = max_age;

        // Store the updated cached value record in the cache
        this.cache.set(identifier, record);

        // Schedule a cache cleanup for this entry if a max_age was provided
        if (max_age !== undefined) this._schedule_cache_cleanup(max_age);
    }

    /**
     * Schedules a cache cleanup to purge stale cache values if the provided `max_age` is earlier than the next expected cleanup.
     *
     * @param {number} max_age
     * @returns {boolean} Whether a sooner cleanup was scheduled.
     */
    _schedule_cache_cleanup(max_age) {
        // Do not schedule anything if auto_purge is disabled
        if (!this.options.auto_purge) return false;

        // Increase the max_age by the purge_age_factor to determine the true max_age of the cached value
        max_age *= this.options.purge_age_factor;

        // Return false if the scheduled expected cleanup is sooner than the provided max_age as there is no need to expedite the cleanup
        const now = Date.now();
        const { timeout, expected_at } = this.#cleanup;
        if (timeout && expected_at && expected_at <= now + max_age) return false;

        // Clear the existing cleanup timeout if one exists
        if (timeout) clearTimeout(timeout);

        // Create a new cleanup timeout to purge stale cache values
        this.#cleanup.expected_at = now + max_age;
        this.#cleanup.timeout = setTimeout(async () => {
            // Clear the existing cleanup timeout
            this.#cleanup.timeout = null;
            this.#cleanup.expected_at = null;

            // Purge stale cache values
            let count = 0;
            let now = Date.now();
            let nearest_expiry_at = Number.MAX_SAFE_INTEGER;
            for (const [identifier, record] of this.cache) {
                // Flush the event loop every max purge items per synchronous event loop tick
                if (count % this.options.max_purge_eloop_tick === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                count++;

                // Skip if the cached value does not have a max value to determine if it is stale
                if (record.max_age === undefined) continue;

                // Skip this cached value if it is not stale
                const true_max_Age = record.max_age * this.options.purge_age_factor;
                const stale = now - true_max_Age > record.updated_at;
                if (!stale) {
                    // Update the nearest expiry timestamp if this cached value is closer than the previous one
                    const expiry_at = record.updated_at + true_max_Age;
                    if (expiry_at < nearest_expiry_at) nearest_expiry_at = expiry_at;

                    // Skip this cached value
                    continue;
                }

                // Emit a purge event with the stale value and the provided arguments
                this.emit('purge', record.value, ...this._parse_arguments(identifier));

                // Delete the stale cached value
                this.cache.delete(identifier);
            }

            // Schedule another cleanup if there are still more values remaining in the cache
            if (this.cache.size && nearest_expiry_at < Number.MAX_SAFE_INTEGER) {
                this._schedule_cache_cleanup(nearest_expiry_at - now);
            }
        }, Math.min(max_age, 2147483647)); // Do not allow the timeout to exceed the maximum timeout value of 2147483647 as it will cause an overflow error
    }

    /**
     * Fetches a fresh value for the provided set of arguments and stores it in the cache for future use.
     *
     * @private
     * @param {string} identifier
     * @param {number=} max_age
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    _get_fresh_value(identifier, max_age, ...args) {
        // Resolve an already in-flight promise if one exists for this identifier
        const in_flight = this.promises.get(identifier);
        if (in_flight) return in_flight;

        // Initialize a new Promise to resolve the fresh value for this identifier
        const promise = new Promise(async (resolve, reject) => {
            // Attempt to resolve the value for the specified arguments from the lookup
            let value, error;
            try {
                value = await this.lookup(...args);
            } catch (e) {
                error = e;
            }

            // Delete the in-flight promise for this identifier
            this.promises.delete(identifier);

            // Check if a value was resolved from the lookup without any errors
            if (value) {
                // Cache the fresh value for this identifier
                this._set_in_cache(identifier, max_age, value);

                // Emit a 'fresh' event with the fresh value and the provided arguments
                this.emit('fresh', value, ...args);

                // Resolve the fresh value
                resolve(value);
            } else {
                // Generate a new error if no value was resolved from the lookup
                error =
                    error ||
                    new Error(
                        `CachedLookup.fresh(${args.join(', ')}) -> No value was returned by the lookup function.`
                    );

                // Reject the fresh value promise with the error
                reject(error);
            }
        });

        // Store the in-flight promise for this identifier so that future calls can re-use it
        this.promises.set(identifier, promise);

        // Return the in-flight promise to the caller
        return promise;
    }

    /**
     * Returns a `cached` value that is up to `max_age` milliseconds old from now.
     * Otherwise, It will fetch a fresh value and update the cache in the background.
     * Use this method over `rolling` if you want to guarantee that the cached value is at most `max_age` milliseconds old at the cost of increased latency whenever a `fresh` value is fetched on a cache miss.
     *
     * @param {Number} max_age In Milliseconds
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    cached(max_age, ...args) {
        if (typeof max_age !== 'number' || isNaN(max_age) || max_age < 0 || max_age > Number.MAX_SAFE_INTEGER)
            throw new Error('CachedLookup.cached(max_age) -> max_age must be a valid number.');

        // Serialize the arguments into an identifier
        const identifier = args.join(this.#delimiter);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_from_cache(identifier, max_age);
        if (record) return Promise.resolve(record.value);

        // Resolve the fresh value for the provided arguments in array serialization
        return this._get_fresh_value(identifier, max_age, ...args);
    }

    /**
     * Returns the most up to date `cached` value even if stale if one is available and automatically fetches a fresh value to ensure the cache is as up to date as possible to the `max_age` provided in milliseconds.
     * Use this method over `cached` if you want lower latency at the cost of a temporarily stale cached value while a `fresh` value is being fetched in the background.
     *
     * @param {Number} target_age In Milliseconds
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    rolling(target_age, ...args) {
        if (
            typeof target_age !== 'number' ||
            isNaN(target_age) ||
            target_age < 0 ||
            target_age > Number.MAX_SAFE_INTEGER
        )
            throw new Error('CachedLookup.rolling(target_age) -> target_age must be a valid number.');

        // Serialize the arguments into an identifier
        const identifier = args.join(this.#delimiter);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_from_cache(identifier, target_age);
        if (record) return Promise.resolve(record.value);

        // Lookup the cached value for the provided arguments
        const cached = this._get_from_cache(identifier);
        if (cached) {
            // Check if the cached value is stale for the provided target_age
            const stale = Date.now() - target_age > cached.updated_at;
            if (stale) {
                // Trigger a fresh lookup for the provided arguments if one is not already in-flight
                const in_flight = this.promises.has(identifier);
                if (!in_flight) this._get_fresh_value(identifier, target_age, ...args);
            }

            // Resolve the stale cached value for the provided arguments while a fresh value is being fetched in the background
            return Promise.resolve(cached.value);
        } else {
            // Resolve a fresh value for the provided arguments as there is no cached value available
            return this._get_fresh_value(identifier, target_age, ...args);
        }
    }

    /**
     * Fetches and returns a fresh value for the provided set of arguments.
     * Note! This method will automatically cache the fresh value for future use for the provided set of arguments.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    fresh(...args) {
        // Resolve the fresh value for the provided serialized arguments
        return this._get_fresh_value(args.join(this.#delimiter), undefined, ...args);
    }

    /**
     * Returns the cached value for the provided set of arguments if it exists.
     * @param  {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {T=}
     */
    get(...args) {
        // Return the cached value for the specified arguments
        return this.cache.get(args.join(this.#delimiter))?.value;
    }

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {boolean} Returns `true` if the cache value was expired, `false` otherwise.
     */
    expire(...args) {
        // Remove the cached value record for the specified arguments
        return this.cache.delete(args.join(this.#delimiter));
    }

    /**
     * Returns whether a fresh value is currently pending / being resolved for the provided set of arguments.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {boolean} Returns `true` if there is an in-flight promise for the specified arguments, `false` otherwise.
     */
    in_flight(...args) {
        // Return true if there is a promise for the specified arguments
        return this.promises.has(args.join(this.#delimiter));
    }

    /**
     * Returns the timestamp in `milliseconds` since the UNIX epoch when the cached value for the provided set of arguments was last updated if it exists.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {number=}
     */
    updated_at(...args) {
        // Return the updated_at timestamp for the specified arguments
        return this.cache.get(args.join(this.#delimiter))?.updated_at;
    }

    /**
     * Clears the lookup instance by removing all cached values from the cache.
     */
    clear() {
        this.cache.clear();
    }
}

module.exports = CachedLookup;
