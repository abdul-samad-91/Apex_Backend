const jwt = require("jsonwebtoken");
require('dotenv').config();

const generateToken = (id , role) => {
  console.log("token" , process.env.JWT_SECRET , process.env.JWT_EXPIRE)
  return jwt.sign({ id , role}, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};
module.exports ={generateToken};