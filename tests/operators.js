/**
 * Returns a promise which is resolved after the specified ms delay
 *
 * @param {Number} ms
 * @returns {Promise}
 */
function async_wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    async_wait,
};
