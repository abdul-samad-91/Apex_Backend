const crypto = require("crypto");

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex"); // e.g ab12cd34
}

module.exports = generateReferralCode;