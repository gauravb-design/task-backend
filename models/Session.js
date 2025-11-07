import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      trim: true
    },
    identifier: {
      type: String,
      trim: true,
      default: ''
    },
    cookies: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    metadata: {
      type: Map,
      of: String,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

sessionSchema.index({ service: 1, identifier: 1 }, { unique: true });

const Session = mongoose.model('Session', sessionSchema);

export default Session;


