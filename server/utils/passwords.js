const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}

async function verifyPassword(password, encoded) {
    const [algorithm, saltValue, hashValue] = String(encoded).split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
