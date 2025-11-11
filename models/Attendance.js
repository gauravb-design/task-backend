import mongoose from 'mongoose';

const BREAK_TYPES = ['lunch', 'rest'];

const breakSchema = new mongoose.Schema(
  {
    breakType: {
      type: String,
      enum: BREAK_TYPES,
      required: true
    },
    startedAt: {
      type: Date,
      required: true
    },
    endedAt: {
      type: Date
    },
    durationMinutes: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    expectedShiftMinutes: {
      type: Number,
      default: 600 // 10 hours
    },
    checkInAt: {
      type: Date
    },
    checkOutAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'checked_out'],
      default: 'not_started'
    },
    totalWorkedMinutes: {
      type: Number,
      default: 0
    },
    totalBreakMinutes: {
      type: Number,
      default: 0
    },
    lunchBreakMinutes: {
      type: Number,
      default: 0
    },
    restBreakMinutes: {
      type: Number,
      default: 0
    },
    overtimeMinutes: {
      type: Number,
      default: 0
    },
    breaks: {
      type: [breakSchema],
      default: []
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

attendanceSchema.methods.recalculateTotals = function recalculateTotals(referenceTime = null) {
  if (!this.checkInAt) {
    this.totalWorkedMinutes = 0;
    this.totalBreakMinutes = 0;
    this.overtimeMinutes = 0;
    return;
  }

  const effectiveEnd = this.checkOutAt || referenceTime || new Date();
  const grossMinutes = Math.max(0, Math.round((effectiveEnd.getTime() - this.checkInAt.getTime()) / 60000));

  const breakTotals = this.breaks.reduce(
    (acc, current) => {
      if (!current.endedAt) {
        return acc;
      }
      const minutes = Math.max(0, Math.round((current.endedAt.getTime() - current.startedAt.getTime()) / 60000));
      acc.total += minutes;
      if (current.breakType === 'lunch') {
        acc.lunch += minutes;
      } else if (current.breakType === 'rest') {
        acc.rest += minutes;
      }
      return acc;
    },
    { total: 0, lunch: 0, rest: 0 }
  );

  this.totalBreakMinutes = breakTotals.total;
  this.lunchBreakMinutes = breakTotals.lunch;
  this.restBreakMinutes = breakTotals.rest;

  this.totalWorkedMinutes = Math.max(0, grossMinutes - this.totalBreakMinutes);
  this.overtimeMinutes = Math.max(0, this.totalWorkedMinutes - this.expectedShiftMinutes);
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;


