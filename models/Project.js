import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  project_name: {
    type: String,
    required: true,
    trim: true
  },
  project_id: {
    type: String,
    required: true,
    unique: true
  },
  client_name: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'on_hold', 'cancelled'],
    default: 'active'
  },
  total_tasks: {
    type: Number,
    default: 0
  },
  completed_tasks: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

projectSchema.index({ project_id: 1 }, { unique: true });

const Project = mongoose.model('Project', projectSchema);

export default Project;

