const EventEmitter = require('events');

/**
 * The types of arguments that can be serialized on each call.
 * @typedef {boolean|number|string|null} SerializableArgumentTypes
 */

/**
 * @typedef {('purge' | 'fresh')} CachedLookupEventTypes
 */

/**
 * @template T
 * @callback CachedLookupEvent
 * @param {T} value
 * @param {...(undefined | null | boolean | string | number)[]} args
 */

/**
 * @template T
 */
class CachedLookup extends EventEmitter {
    #delimiter = ',';
    #cleanup = {
        interval: null,
        running: false,
    };

    /**
     * @typedef {Object} CachedRecord
     * @property {Array} args - Original arguments for purge events.
     * @property {T} value
     * @property {number} ttl - Retention time for this resident key.
     * @property {number} timestamp - Time of the last successful store.
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
    #options;

    /**
     * The lookup function that is used to resolve fresh values for the provided arguments.
     * @type {LookupFunction}
     */
    #lookup;

    /**
     * Stores the cached values identified by the serialized arguments from lookup calls.
     * @type {Map<string, CachedRecord>}
     */
    #cache = new Map();

    /**
     * Stores each pending promise with the highest TTL requested by its callers.
     * @type {Map<string, {promise: Promise<T>, ttl: number}>}
     */
    #in_flight = new Map();

    /**
     * Returns the resolved constructor options.
     *
     * @returns {Readonly<ConstructorOptions>}
     */
    get options() {
        return this.#options;
    }

    /**
     * Returns the lookup handler used for fresh values.
     *
     * @returns {LookupFunction}
     */
    get lookup() {
        return this.#lookup;
    }

    /**
     * Returns the map of completed value records.
     *
     * @returns {Map<string, CachedRecord>}
     */
    get cache() {
        return this.#cache;
    }

    /**
     * @typedef {Object} ConstructorOptions
     * @property {number} [cache_ttl_ms=60000] - Base retention time and sweep interval in milliseconds.
     * Infinity disables sweeping.
     * @property {boolean} [cache_ttl_static=false] - Whether retention stays fixed at cache_ttl_ms.
     * @property {number} [cache_sweep_iterations=5000] - Records inspected before yielding during a sweep.
     */

    /**
     * Creates a new CachedLookup instance with the specified lookup function.
     * The lookup function can be both synchronous or asynchronous.
     *
     * @param {(ConstructorOptions|LookupFunction)} options - The constructor options or lookup function.
     * @param {LookupFunction} [lookup] - The lookup function when options are first.
     */
    constructor(options, lookup) {
        super();

        // Ensure the options parameter is either the lookup function or an object.
        if (typeof options === 'function') {
            lookup = options;
        } else if (options === undefined) {
            options = {};
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
        this.#lookup = lookup;
        const configured_options = typeof options === 'object' ? options : {};
        this.#options = Object.freeze({
            cache_ttl_ms: configured_options.cache_ttl_ms ?? 60000,
            cache_ttl_static: configured_options.cache_ttl_static ?? false,
            cache_sweep_iterations: configured_options.cache_sweep_iterations ?? 5000,
        });
        const finite_ttl = this.#options.cache_ttl_ms !== Infinity;
        const valid_ttl = Number.isSafeInteger(this.#options.cache_ttl_ms) && this.#options.cache_ttl_ms > 0;
        if (finite_ttl && !valid_ttl) {
            throw new Error('CachedLookup: cache_ttl_ms must be a positive integer or Infinity.');
        }
        if (typeof this.#options.cache_ttl_static !== 'boolean') {
            throw new Error('new CachedLookup(options, lookup) -> cache_ttl_static must be a Boolean.');
        }
        const valid_iterations =
            Number.isSafeInteger(this.#options.cache_sweep_iterations) && this.#options.cache_sweep_iterations > 0;
        if (!valid_iterations) {
            throw new Error('CachedLookup: cache_sweep_iterations must be a positive integer.');
        }
    }

    /**
     * Registers a listener for fresh or purge events.
     * Listeners receive the value followed by the original lookup arguments.
     *
     * @param {CachedLookupEventTypes} event
     * @param {CachedLookupEvent<T>} listener
     * @returns {this}
     */
    on(event, listener) {
        return super.on(...arguments);
    }

    /**
     * Registers a listener that runs once for a fresh or purge event.
     *
     * @param {CachedLookupEventTypes} event
     * @param {CachedLookupEvent<T>} listener
     * @returns {this}
     */
    once(event, listener) {
        return super.once(...arguments);
    }

    /**
     * Emits a fresh or purge event with its value and lookup arguments.
     *
     * @param {CachedLookupEventTypes} event
     * @param {CachedLookupEvent<T>} args
     * @returns {boolean}
     */
    emit(event, ...args) {
        return super.emit(...arguments);
    }

    /**
     * Reads a completed record if this caller accepts its age.
     * A resident record can still grow its retention TTL when it is too old
     * for the caller, since that caller may join or start a refresh.
     *
     * @private
     * @param {string} identifier
     * @param {number=} max_age_ms - Maximum acceptable value age; also raises retention.
     * @returns {CachedRecord=}
     */
    _get_from_cache(identifier, max_age_ms) {
        const record = this.#cache.get(identifier);
        if (!record) return;
        if (max_age_ms === undefined) return record;

        this._observe_ttl(identifier, max_age_ms);
        if (max_age_ms === 0) return;

        const age_ms = Date.now() - record.timestamp;
        if (age_ms > max_age_ms) return;
        return record;
    }

    /**
     * Stores a successful lookup with the key's current retention TTL.
     * A refresh keeps any TTL increase from the previous resident record.
     *
     * @private
     * @param {string} identifier
     * @param {number=} ttl
     * @param {T} value
     * @param {Array} args
     */
    _set_in_cache(identifier, ttl, value, args) {
        const previous = this.#cache.get(identifier);
        const base_ttl = this.#options.cache_ttl_ms;
        const retention_ttl = this.#options.cache_ttl_static
            ? base_ttl
            : Math.max(base_ttl, ttl || 0, previous?.ttl || 0);

        this.#cache.set(identifier, {
            args,
            value,
            ttl: retention_ttl,
            timestamp: Date.now(),
        });
        this._update_cache_cleanup();
    }

    /**
     * Raises retention for a resident value and any shared pending lookup.
     * Static retention leaves both unchanged.
     *
     * @private
     */
    _observe_ttl(identifier, ttl) {
        if (this.#options.cache_ttl_static) return;

        const record = this.#cache.get(identifier);
        if (record) record.ttl = Math.max(record.ttl, ttl);

        const in_flight = this.#in_flight.get(identifier);
        if (in_flight) in_flight.ttl = Math.max(in_flight.ttl, ttl);
    }

    /**
     * Runs one sweep interval while finite-TTL records are resident.
     * Stops it when the cache becomes empty.
     *
     * @private
     */
    _update_cache_cleanup() {
        const needs_sweep = this.#cache.size && this.#options.cache_ttl_ms !== Infinity;
        if (!needs_sweep) {
            if (this.#cleanup.interval) clearInterval(this.#cleanup.interval);
            this.#cleanup.interval = null;
            return;
        }
        if (this.#cleanup.interval) return;

        this.#cleanup.interval = setInterval(
            () => this._purge_stale_cache(),
            Math.min(this.#options.cache_ttl_ms, 2147483647),
        );
        this.#cleanup.interval.unref?.();
    }

    /**
     * Removes records that have reached their individual retention deadlines.
     * Yields after each batch and prevents another sweep from overlapping it.
     *
     * @private
     */
    async _purge_stale_cache() {
        if (this.#cleanup.running) return;

        this.#cleanup.running = true;
        try {
            let count = 0;
            let now = Date.now();
            for (const [identifier, record] of this.#cache) {
                const batch_complete = count > 0 && count % this.#options.cache_sweep_iterations === 0;
                if (batch_complete) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    now = Date.now();
                }
                count++;
                if (this.#cache.get(identifier) !== record) continue;

                const age_ms = now - record.timestamp;
                if (age_ms < record.ttl) continue;

                this.#cache.delete(identifier);
                this.emit('purge', record.value, ...record.args);
            }
        } finally {
            this.#cleanup.running = false;
            this._update_cache_cleanup();
        }
    }

    /**
     * Starts or joins one lookup for a key.
     * Shared callers can raise the TTL of its eventual successful record.
     *
     * @private
     * @param {string} identifier
     * @param {number=} max_age_ms
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    _get_fresh_value(identifier, max_age_ms, ...args) {
        const existing = this.#in_flight.get(identifier);
        if (existing) {
            if (max_age_ms !== undefined) this._observe_ttl(identifier, max_age_ms);
            return existing.promise;
        }

        let resolve, reject;
        const promise = new Promise((yes, no) => {
            resolve = yes;
            reject = no;
        });
        const in_flight = {ttl: max_age_ms || 0, promise};
        this.#in_flight.set(identifier, in_flight);

        (async () => {
            let value, error;
            try {
                value = await this.#lookup(...args);
            } catch (e) {
                error = e;
            }

            this.#in_flight.delete(identifier);

            if (value === undefined) {
                if (!error) {
                    const call = `CachedLookup.fresh(${args.join(', ')})`;
                    const message = `${call} -> No value was returned by the lookup function.`;
                    error = new Error(message);
                }
                reject(error);
                return;
            }

            try {
                this._set_in_cache(identifier, in_flight.ttl, value, args);
                this.emit('fresh', value, ...args);
                resolve(value);
            } catch (e) {
                reject(e);
            }
        })();

        return promise;
    }

    /**
     * Returns a completed value within this caller's maximum age.
     * Otherwise, waits for a shared lookup. Zero bypasses completed values.
     * The requested age can raise retention without changing the timestamp.
     *
     * @param {Number} max_age_ms In Milliseconds
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    cached(max_age_ms, ...args) {
        const invalid_type = typeof max_age_ms !== 'number';
        const invalid_age =
            invalid_type || max_age_ms < 0 || Number.isNaN(max_age_ms) || max_age_ms > Number.MAX_SAFE_INTEGER;
        if (invalid_age) {
            throw new Error('CachedLookup.cached(max_age_ms) -> max_age_ms must be a valid number.');
        }

        // Serialize the arguments into an identifier
        const identifier = args.join(this.#delimiter);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_from_cache(identifier, max_age_ms);
        if (record) return Promise.resolve(record.value);

        // Resolve the fresh value for the provided arguments in array serialization
        return this._get_fresh_value(identifier, max_age_ms, ...args);
    }

    /**
     * Returns a resident value immediately, even when stale.
     * A stale value triggers a background refresh; a missing value waits for it.
     * Zero still returns a resident value while refreshing it.
     *
     * @param {Number} max_age_ms In Milliseconds
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    rolling(max_age_ms, ...args) {
        const invalid_type = typeof max_age_ms !== 'number';
        const invalid_age =
            invalid_type || max_age_ms < 0 || Number.isNaN(max_age_ms) || max_age_ms > Number.MAX_SAFE_INTEGER;
        if (invalid_age) {
            throw new Error('CachedLookup.rolling(max_age_ms) -> max_age_ms must be a valid number.');
        }

        // Serialize the arguments into an identifier
        const identifier = args.join(this.#delimiter);

        // Attempt to resolve the cached value from the cached value record
        const record = this._get_from_cache(identifier, max_age_ms);
        if (record) return Promise.resolve(record.value);

        // Lookup the cached value for the provided arguments
        const cached = this._get_from_cache(identifier);
        if (!cached) {
            return this._get_fresh_value(identifier, max_age_ms, ...args);
        }

        const age_ms = Date.now() - cached.timestamp;
        const stale = max_age_ms === 0 || age_ms > max_age_ms;
        if (stale) {
            // Handle the background rejection while returning the stale value.
            this._get_fresh_value(identifier, max_age_ms, ...args).catch(() => {});
        }

        return Promise.resolve(cached.value);
    }

    /**
     * Fetches and returns a fresh value for the provided set of arguments.
     * Joins a lookup already in flight and retains a successful value for
     * at least the instance's base retention TTL.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {Promise<T>}
     */
    fresh(...args) {
        // Resolve the fresh value for the provided serialized arguments
        return this._get_fresh_value(args.join(this.#delimiter), undefined, ...args);
    }

    /**
     * Reads a resident value without starting a lookup.
     * A value can remain readable past its deadline until the next sweep.
     *
     * @param  {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {T=}
     */
    get(...args) {
        // Return the cached value for the specified arguments
        return this.#cache.get(args.join(this.#delimiter))?.value;
    }

    /**
     * Expires the cached value for the provided set of arguments.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {boolean} Returns `true` if the cache value was expired, `false` otherwise.
     */
    expire(...args) {
        // Remove the cached value record for the specified arguments
        const removed = this.#cache.delete(args.join(this.#delimiter));
        this._update_cache_cleanup();
        return removed;
    }

    /**
     * Reports whether a lookup is pending for these arguments.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {boolean}
     */
    in_flight(...args) {
        // Return true if there is a promise for the specified arguments
        return this.#in_flight.has(args.join(this.#delimiter));
    }

    /**
     * Returns the last successful store time in milliseconds since the UNIX epoch.
     *
     * @param {...(SerializableArgumentTypes|Array<SerializableArgumentTypes>)} args
     * @returns {number=}
     */
    updated_at(...args) {
        // Return the updated_at timestamp for the specified arguments
        return this.#cache.get(args.join(this.#delimiter))?.timestamp;
    }

    /**
     * Removes all completed records and stops the sweep interval.
     * Pending lookups remain in flight and can store a value later.
     */
    clear() {
        this.#cache.clear();
        this._update_cache_cleanup();
    }
}

module.exports = CachedLookup;
