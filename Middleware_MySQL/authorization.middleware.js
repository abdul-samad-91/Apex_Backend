require("dotenv").config();
const jwt = require("jsonwebtoken");
const { User } = require("../Models_MySQL");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Use findByPk for MySQL with Sequelize
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password', 'otp', 'otpExpiry'] }
      });

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Attach user to request
      req.user = user;

      next();
    } catch (error) {
      console.error('Auth error:', error.message);
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }
  } else {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

// Admin Authorization
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({
      message: "Authorization error: Admin access only",
    });
  }
};

module.exports = { protect, isAdmin };
