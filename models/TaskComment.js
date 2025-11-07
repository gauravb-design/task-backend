import mongoose from 'mongoose';

const taskCommentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    body: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

const TaskComment = mongoose.model('TaskComment', taskCommentSchema);

export default TaskComment;


