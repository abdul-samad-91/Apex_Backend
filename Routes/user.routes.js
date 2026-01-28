const express = require('express');
const router = express.Router();
const {login} = require('../Controller/auth.controller')
const {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    updatePassword
} = require('../Controller/user.controller');
const {protect , isAdmin} = require("../Middleware/authorization.middleware")


// Create new user
router.post('/register', createUser);

// authenticate user/admin
router.post ('/auth' , login)

// Get all users
router.get('/', protect , isAdmin , getAllUsers);

// Get user by ID
router.get('/:id', protect  , getUserById);

// Update user
router.put('/:id' , protect , updateUser);

// Delete user
router.delete('/:id', protect , isAdmin ,  deleteUser);

// Update password
router.put('/:id/password', protect , updatePassword);

module.exports = router;
