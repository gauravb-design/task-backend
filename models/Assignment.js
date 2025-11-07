import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema({
  task_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assigned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assigned_at: {
    type: Date,
    default: Date.now
  },
  due_date: {
    type: Date
  },
  estimate_hours: {
    type: Number,
    default: 0,
    min: 0
  },
  completed_at: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

assignmentSchema.index({ task_id: 1 });
assignmentSchema.index({ assigned_to: 1 });
assignmentSchema.index({ status: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);

export default Assignment;

