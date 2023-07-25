import EventEmitter from 'events';

type ArgsType<T> = T extends (...args: infer U) => any ? U : never;
type ResolvedType<T> = T extends PromiseLike<infer U> ? U : T;

type LookupHandler<T extends (...args: any[]) => any> = T;

interface CachedLookupEvents<T, U extends ArgsType<T>> {
    purge: [T, ...U];
    fresh: [T, ...U];
}

interface ConstructorOptions {
    auto_purge?: boolean;
    purge_age_factor?: number;
}

interface ValueRecord<T = unknown> {
    value: T;
    max_age?: number;
    updated_at: number;
}

export default class CachedLookup<T extends (...args: any[]) => any> extends EventEmitter {
    lookup: LookupHandler<T>;
    cache: Map<string, ValueRecord<ResolvedType<ReturnType<T>>>>;
    promises: Map<string, Promise<ResolvedType<ReturnType<T>>>>;

    constructor(lookup: LookupHandler<T>);
    constructor(options: ConstructorOptions, lookup: LookupHandler<T>);

    // Override the default `EventEmitter` methods to provide type safety
    on<K extends keyof CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>>(
        event: K,
        listener: (...args: CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>[K]) => void
    ): this;
    once<K extends keyof CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>>(
        event: K,
        listener: (...args: CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>[K]) => void
    ): this;
    emit<K extends keyof CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>>(
        event: K,
        ...args: CachedLookupEvents<ResolvedType<ReturnType<T>>, ArgsType<T>>[K]
    ): boolean;

    /**
     * Returns a `cached` value that is up to `max_age` milliseconds old from now.
     * Otherwise, It will fetch a fresh value and update the cache in the background.
     * Use this method over `rolling` if you want to guarantee that the cached value is at most `max_age` milliseconds old at the cost of increased latency whenever a `fresh` value is fetched on a cache miss.
     */
    cached(max_age: number, ...args: ArgsType<T>): Promise<ResolvedType<ReturnType<T>>>;

    /**
     * Returns the most up to date `cached` value even if stale if one is available and automatically fetches a fresh value to ensure the cache is as up to date as possible to the `max_age` provided in milliseconds.
     * Use this method over `cached` if you want lower latency at the cost of a temporarily stale cached value while a `fresh` value is being fetched in the background.
     */
    rolling(max_age: number, ...args: ArgsType<T>): Promise<ResolvedType<ReturnType<T>>>;

    /**
     * Fetches and returns a fresh value for the provided set of arguments.
     * Note! This method will automatically cache the fresh value for future use for the provided set of arguments.
     */
    fresh(...args: ArgsType<T>): Promise<ResolvedType<ReturnType<T>>>;

    /**
     * Returns the cached value for the provided set of arguments if it exists.
     */
    get(...args: ArgsType<T>): ResolvedType<ReturnType<T>> | undefined;

    /**
     * Expires the cached value for the provided set of arguments.
     * @returns {boolean} Returns `true` if the cache value was expired, `false` otherwise.
     */
    expire(...args: ArgsType<T>): boolean;

    /**
     * Returns whether a fresh value is currently pending / being resolved for the provided set of arguments.
     * @returns {boolean} Returns `true` if there is an in-flight promise for the specified arguments, `false` otherwise.
     */
    in_flight(...args: ArgsType<T>): boolean;

    /**
     * Returns the timestamp in `milliseconds` since the UNIX epoch when the cached value for the provided set of arguments was last updated if it exists.
     */
    updated_at(...args: ArgsType<T>): number | undefined;

    /**
     * Clears the lookup instance by removing all cached values from the cache.
     */
    clear(): void;
}
