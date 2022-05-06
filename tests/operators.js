function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt.toLocaleString([], { hour12: true, timeZone: 'America/New_York' }).replace(', ', ' ').split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

function async_wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert_log(group, target, assertion) {
    try {
        let result = assertion();
        if (result) {
            log(group, 'Verified ' + target);
        } else {
            throw new Error('Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString());
        }
    } catch (error) {
        console.log(error);
        throw new Error('Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString());
    }
}

async function with_duration(promise) {
    const start = Date.now();
    const result = await promise;
    const end = Date.now();
    return [result, end - start];
}

module.exports = {
    log,
    async_wait,
    assert_log,
    with_duration,
};
