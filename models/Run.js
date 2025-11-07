import mongoose from 'mongoose';

const runSchema = new mongoose.Schema({
  run_date: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'partial'],
    default: 'running'
  },
  total_tasks_found: {
    type: Number,
    default: 0
  },
  tasks_imported: {
    type: Number,
    default: 0
  },
  tasks_updated: {
    type: Number,
    default: 0
  },
  tasks_skipped: {
    type: Number,
    default: 0
  },
  duration_seconds: {
    type: Number,
    default: 0
  },
  error_message: {
    type: String,
    default: ''
  },
  csv_file_name: {
    type: String,
    default: ''
  },
  initiated_by: {
    type: String,
    default: 'automated'
  },
  logs: [{
    timestamp: Date,
    level: String,
    message: String
  }]
}, {
  timestamps: true
});

runSchema.index({ run_date: -1 });
runSchema.index({ status: 1 });

const Run = mongoose.model('Run', runSchema);

export default Run;

