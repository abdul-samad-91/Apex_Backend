const User = require('../Models/user.model');
const bcrypt = require('bcrypt');

// Create new user
const createUser = async (req, res) => {
  try {
    const {
      fullName,
      cnic,
      email,
      phoneNumber,
      password,
      confirmPassword,
      role,
    } = req.body;

    // 🔹 Required fields check
    if (!fullName || !cnic || !email || !phoneNumber || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 🔹 Regex validations
    // if (!CNIC_REGEX.test(cnic)) {
    //   return res.status(400).json({ message: "Invalid CNIC format" });
    // }

    // if (!EMAIL_REGEX.test(email)) {
    //   return res.status(400).json({ message: "Invalid email format" });
    // }

    // if (!PHONE_REGEX.test(phoneNumber)) {
    //   return res.status(400).json({ message: "Invalid phone number format" });
    // }

    // 🔹 Password match check
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // 🔹 Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { cnic }, { phoneNumber }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with provided email, CNIC, or phone number",
      });
    }

    // 🔹 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔹 Create new user
    const user = new User({
      fullName,
      cnic,
      email,
      phoneNumber,
      password: hashedPassword,
      role,
    });

    await user.save();

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating user",
      error: error.message,
    });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { name, email, role, isActive } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ 
            message: 'User updated successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

// Update password
const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
};

module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    updatePassword
};
