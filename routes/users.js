import express from 'express';
import {
  login,
  register,
  getUsers,
  getUserById,
  updateUser,
  deleteUser
} from '../controllers/userController.js';

const router = express.Router();

// Auth routes
router.post('/login', login);
router.post('/register', register);

// User management routes
router.get('/', getUsers);
router.get('/:id', getUserById);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;

