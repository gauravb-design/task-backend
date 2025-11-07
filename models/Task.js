import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  task_name: {
    type: String,
    required: true,
    trim: true
  },
  project_name: {
    type: String,
    required: true,
    trim: true
  },
  project_id: {
    type: String,
    required: true
  },
  parent_id: {
    type: String,
    required: true
  },
  task_url: {
    type: String,
    required: true
  },
  due_date: {
    type: Date,
    default: null
  },
  category: {
    type: String,
    default: 'Uncategorized',
    enum: [
      'Homepage Tasks',
      'Email Tasks',
      'Design LPs',
      'Supplementary Elements Design',
      'Sub Page Designs',
      'Coding Preparation',
      'Design QA',
      'UX Audit',
      'Logo Design',
      'Product Page Optimization',
      'Product Page Optimizations',
      'Category Page Optimization',
      'Media & Creatives',
      'Design Graphic',
      'Design Short Videos',
      'QA + Schedule Posts',
      'Audit Fixes',
      'Animations & Micro Interactions',
      'Content Updates',
      'Product Page Mockups',
      'Category Page Mockups',
      'Mobile Homepage Mockup',
      'Design Profile + Cover Graphics',
      'Uncategorized'
    ]
  },
  time_tracked: {
    type: String,
    default: null
  },
  time_tracked_decimal: {
    type: Number,
    default: 0
  },
  estimate_hours: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['unassigned', 'assigned', 'in_progress', 'in_review', 'completed', 'on_hold'],
    default: 'unassigned'
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  designer_notes: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  run_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Run'
  }
}, {
  timestamps: true
});

// Index for faster queries
taskSchema.index({ project_id: 1, parent_id: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ assigned_to: 1 });

const Task = mongoose.model('Task', taskSchema);

export default Task;

