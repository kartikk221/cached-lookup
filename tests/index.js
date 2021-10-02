const CachedLookup = require('../index.js');
const CONFIGURATION = {
    iterations: 20,
    delay: 50,
    value: Math.random().toString(),
};

const TestLookup = new CachedLookup(
    250,
    () =>
        new Promise((resolve, reject) => {
            setTimeout(() => resolve('something'), CONFIGURATION.delay);
        })
);

console.log(
    `Generating ${CONFIGURATION.iterations} Lookup Hits @ ${CONFIGURATION.delay}ms Delay...`
);

const timings = {};
for (let i = 1; i <= CONFIGURATION.iterations; i++) {
    setTimeout(
        async (num) => {
            const start_time = Date.now();
            await TestLookup.get();
            timings[num] = Date.now() - start_time;
        },
        i * CONFIGURATION.delay,
        i
    );
}

setTimeout(() => {
    console.log(`Validating Generated Timing Hits...`);
    let zeros = 0;
    let duration = 0;
    Object.keys(timings).forEach((iteration) => {
        const time = timings[iteration];
        if (time < 2) {
            // 2ms is acceptable time for event loop delays
            zeros++;
        } else {
            duration += time;
        }
    });

    let zeros_ratio = zeros / CONFIGURATION.iterations;
    if (zeros_ratio > 0.85) throw new Error('Recieved A Bad Zeros Ratio For Timings');

    if (duration > CONFIGURATION.delay * (CONFIGURATION.delay / 10))
        throw new Error('Recieved A Bad Total Duration Ratio For Timings');

    console.log('Successfully Validated Zeros & Timings Within Valid Ratio');
    console.log(`
RESULTS:
TIMINGS: ${Object.keys(timings)
        .map((t) => `${timings[t]}ms`)
        .join(', ')}
ZEROS: ${zeros} @ RATIO ${zeros_ratio} < 0.85
TOTAL DURATION: ${duration} < ${CONFIGURATION.delay * 5}`);
}, 50 * CONFIGURATION.iterations);
