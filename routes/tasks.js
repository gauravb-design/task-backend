import express from 'express';
import {
  importTasks,
  getTasks,
  getTaskById,
  assignTask,
  updateTaskStatus,
  getTaskStats,
  getTaskComments,
  addTaskComment,
  deleteTask
} from '../controllers/taskController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Task routes
router.post('/import', importTasks);
router.get('/stats', getTaskStats); // Must be before /:id route
router.get('/', getTasks);
router.get('/:id', getTaskById);
router.post(
  '/:id/assign',
  protect,
  authorize('admin', 'pm', 'pc'),
  assignTask
);
router.patch(
  '/:id/status',
  protect,
  authorize('admin', 'pm', 'pc', 'designer'),
  updateTaskStatus
);
router.get(
  '/:id/comments',
  protect,
  authorize('admin', 'pm', 'pc', 'designer'),
  getTaskComments
);
router.post(
  '/:id/comments',
  protect,
  authorize('admin', 'pm', 'pc', 'designer'),
  addTaskComment
);
router.delete(
  '/:id',
  protect,
  authorize('admin', 'pm', 'pc'),
  deleteTask
);

export default router;

