import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import chalk from 'chalk';
import connectDB from './config/db.js';

// Import routes
import taskRoutes from './routes/tasks.js';
import runRoutes from './routes/runs.js';
import userRoutes from './routes/users.js';
import attendanceRoutes from './routes/attendance.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(chalk.cyan(`${req.method} ${req.path}`));
  next();
});

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 Task Crawler & Assignment Management System API',
    version: '1.0.0',
    author: 'Gaurav Bhagat',
    endpoints: {
      tasks: '/api/tasks',
      runs: '/api/runs',
      users: '/api/users',
      attendance: '/api/attendance',
      health: '/health'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(chalk.red(`❌ Error: ${err.message}`));
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(chalk.green.bold(`\n${'='.repeat(50)}`));
  console.log(chalk.green.bold(`🚀 Server running on port ${PORT}`));
  console.log(chalk.green.bold(`📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`));
  console.log(chalk.green.bold(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`));
  console.log(chalk.green.bold(`${'='.repeat(50)}\n`));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(chalk.red(`❌ Unhandled Rejection: ${err.message}`));
  console.error(err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(chalk.red(`❌ Uncaught Exception: ${err.message}`));
  console.error(err);
  process.exit(1);
});

export default app;

