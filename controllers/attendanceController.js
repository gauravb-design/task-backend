import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import chalk from 'chalk';

const SHIFT_MINUTES = 600;
const LUNCH_BREAK_MINUTES = 45;
const REST_BREAK_MINUTES = 15;

const BREAK_TYPES = ['lunch', 'rest'];

const getStartOfDay = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getEndOfDay = (date = new Date()) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

const findOrCreateToday = async (userId) => {
  const today = getStartOfDay();
  let attendance = await Attendance.findOne({ user: userId, date: today });
  if (!attendance) {
    attendance = await Attendance.create({
      user: userId,
      date: today,
      expectedShiftMinutes: SHIFT_MINUTES,
      status: 'not_started'
    });
  }
  return attendance;
};

const getOpenBreak = (attendance) =>
  attendance.breaks.find((entry) => !entry.endedAt);

export const checkIn = async (req, res) => {
  try {
    const attendance = await findOrCreateToday(req.user._id);

    if (attendance.checkInAt) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in for today'
      });
    }

    attendance.checkInAt = new Date();
    attendance.status = 'in_progress';
    attendance.recalculateTotals();
    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Check-in successful',
      data: attendance
    });
  } catch (error) {
    console.error(chalk.red(`❌ Check-in error: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Unable to check in',
      error: error.message
    });
  }
};

export const checkOut = async (req, res) => {
  try {
    const attendance = await findOrCreateToday(req.user._id);

    if (!attendance.checkInAt) {
      return res.status(400).json({
        success: false,
        message: 'You must check in before checking out'
      });
    }

    if (attendance.checkOutAt) {
      return res.status(400).json({
        success: false,
        message: 'Already checked out for today'
      });
    }

    const openBreak = getOpenBreak(attendance);
    if (openBreak) {
      return res.status(400).json({
        success: false,
        message: `Please end your ${openBreak.breakType} break before checking out`
      });
    }

    attendance.checkOutAt = new Date();
    attendance.status = 'checked_out';
    attendance.recalculateTotals();
    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Check-out successful',
      data: attendance
    });
  } catch (error) {
    console.error(chalk.red(`❌ Check-out error: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Unable to check out',
      error: error.message
    });
  }
};

export const startBreak = async (req, res) => {
  try {
    const { breakType } = req.body;
    if (!BREAK_TYPES.includes(breakType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid break type'
      });
    }

    const attendance = await findOrCreateToday(req.user._id);

    if (!attendance.checkInAt) {
      return res.status(400).json({
        success: false,
        message: 'You must check in before starting a break'
      });
    }

    if (attendance.checkOutAt) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked out for today'
      });
    }

    const openBreak = getOpenBreak(attendance);
    if (openBreak) {
      return res.status(400).json({
        success: false,
        message: `You already have an active ${openBreak.breakType} break`
      });
    }

    if (breakType === 'lunch' && attendance.breaks.some((entry) => entry.breakType === 'lunch')) {
      return res.status(400).json({
        success: false,
        message: 'Lunch break has already been taken'
      });
    }

    if (breakType === 'rest' && attendance.breaks.some((entry) => entry.breakType === 'rest')) {
      return res.status(400).json({
        success: false,
        message: 'Rest break has already been taken'
      });
    }

    attendance.breaks.push({
      breakType,
      startedAt: new Date()
    });
    attendance.recalculateTotals();
    await attendance.save();

    res.status(200).json({
      success: true,
      message: `${breakType === 'lunch' ? 'Lunch' : 'Rest'} break started`,
      data: attendance
    });
  } catch (error) {
    console.error(chalk.red(`❌ Start break error: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Unable to start break',
      error: error.message
    });
  }
};

export const endBreak = async (req, res) => {
  try {
    const attendance = await findOrCreateToday(req.user._id);

    if (!attendance.checkInAt) {
      return res.status(400).json({
        success: false,
        message: 'You must check in before ending a break'
      });
    }

    const openBreak = getOpenBreak(attendance);
    if (!openBreak) {
      return res.status(400).json({
        success: false,
        message: 'No active break to end'
      });
    }

    openBreak.endedAt = new Date();
    openBreak.durationMinutes = Math.max(
      0,
      Math.round((openBreak.endedAt.getTime() - openBreak.startedAt.getTime()) / 60000)
    );

    attendance.recalculateTotals();
    await attendance.save();

    const allowance = openBreak.breakType === 'lunch' ? LUNCH_BREAK_MINUTES : REST_BREAK_MINUTES;
    const message =
      openBreak.durationMinutes > allowance
        ? `${openBreak.breakType === 'lunch' ? 'Lunch' : 'Rest'} break ended (exceeded ${allowance} minutes allowance)`
        : `${openBreak.breakType === 'lunch' ? 'Lunch' : 'Rest'} break ended`;

    res.status(200).json({
      success: true,
      message,
      data: attendance
    });
  } catch (error) {
    console.error(chalk.red(`❌ End break error: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Unable to end break',
      error: error.message
    });
  }
};

export const getMyTodayAttendance = async (req, res) => {
  try {
    const today = getStartOfDay();
    const attendance = await Attendance.findOne({ user: req.user._id, date: today });
    res.status(200).json({
      success: true,
      data: attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch attendance',
      error: error.message
    });
  }
};

export const getMyAttendanceHistory = async (req, res) => {
  try {
    const { from, to, limit = 30 } = req.query;
    const defaultStart = getStartOfDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
    const start = from ? getStartOfDay(new Date(from)) : defaultStart;
    const end = to ? getEndOfDay(new Date(to)) : getEndOfDay();

    const records = await Attendance.find({
      user: req.user._id,
      date: { $gte: start, $lte: end }
    })
      .sort({ date: -1 })
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch attendance history',
      error: error.message
    });
  }
};

export const getAttendanceRecords = async (req, res) => {
  try {
    const { date, userId, status, from, to, limit = 100 } = req.query;
    const query = {};

    if (userId) {
      query.user = userId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (date) {
      const target = new Date(date);
      query.date = {
        $gte: getStartOfDay(target),
        $lte: getEndOfDay(target)
      };
    } else if (from || to) {
      query.date = {};
      if (from) {
        query.date.$gte = getStartOfDay(new Date(from));
      }
      if (to) {
        query.date.$lte = getEndOfDay(new Date(to));
      }
    }

    const records = await Attendance.find(query)
      .populate('user', 'name email role department isActive')
      .sort({ date: -1 });

    const workforceRoles = ['admin', 'pm', 'pc', 'designer'];
    const users = await User.find({ role: { $in: workforceRoles } }).select('name email role department isActive');

    const attendanceByUser = new Map();
    records.forEach((record) => {
      if (record.user) {
        attendanceByUser.set(record.user._id.toString(), record);
      }
    });

    const filtered = [];

    users.forEach((userDoc) => {
      const userIdString = userDoc._id.toString();
      const record = attendanceByUser.get(userIdString);

      if (record) {
        if (!status || status === 'all' || record.status === status) {
          filtered.push(record);
        }
        return;
      }

      const virtualRecord = {
        _id: `${userIdString}-${date || 'virtual'}`,
        user: userDoc,
        status: 'not_started',
        checkInAt: null,
        checkOutAt: null,
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        overtimeMinutes: 0,
        breaks: []
      };

      if (!status || status === 'all' || status === 'not_started') {
        filtered.push(virtualRecord);
      }
    });

    const limited = filtered.slice(0, parseInt(limit, 10));

    res.status(200).json({
      success: true,
      data: limited
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch attendance records',
      error: error.message
    });
  }
};

export const getDailyAttendanceSummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const start = getStartOfDay(targetDate);
    const end = getEndOfDay(targetDate);

    const records = await Attendance.find({
      date: { $gte: start, $lte: end }
    }).populate('user', 'name email role department');

    const totals = {
      checkedIn: 0,
      checkedOut: 0,
      notStarted: 0,
      activeBreaks: 0
    };

    const details = records.map((record) => {
      const openBreak = getOpenBreak(record);
      if (record.status === 'checked_out') {
        totals.checkedOut += 1;
      } else if (record.status === 'in_progress') {
        totals.checkedIn += 1;
      } else {
        totals.notStarted += 1;
      }
      if (openBreak) {
        totals.activeBreaks += 1;
      }
      return {
        id: record._id,
        user: record.user,
        status: record.status,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        totalWorkedMinutes: record.totalWorkedMinutes,
        totalBreakMinutes: record.totalBreakMinutes,
        overtimeMinutes: record.overtimeMinutes,
        openBreak: openBreak ? { breakType: openBreak.breakType, startedAt: openBreak.startedAt } : null
      };
    });

    res.status(200).json({
      success: true,
      data: {
        date: start,
        totals,
        details
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch attendance summary',
      error: error.message
    });
  }
};


