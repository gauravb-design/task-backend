import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
  }

  next();
};


