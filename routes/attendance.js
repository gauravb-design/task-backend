import express from 'express';
import {
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  getMyTodayAttendance,
  getMyAttendanceHistory,
  getAttendanceRecords,
  getDailyAttendanceSummary
} from '../controllers/attendanceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const workforceRoles = ['admin', 'pm', 'pc', 'designer'];

router.post('/check-in', protect, authorize(...workforceRoles), checkIn);
router.post('/check-out', protect, authorize(...workforceRoles), checkOut);
router.post('/breaks/start', protect, authorize(...workforceRoles), startBreak);
router.post('/breaks/end', protect, authorize(...workforceRoles), endBreak);

router.get('/me/today', protect, authorize(...workforceRoles), getMyTodayAttendance);
router.get('/me/history', protect, authorize(...workforceRoles), getMyAttendanceHistory);

router.get('/summary/daily', protect, authorize('admin'), getDailyAttendanceSummary);
router.get('/', protect, authorize('admin'), getAttendanceRecords);

export default router;


