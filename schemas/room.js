const mongoose = require('mongoose');

const { Schema } = mongoose;
const {
  Types: { ObjectId },
} = Schema;
const roomSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  owner: {
    type: ObjectId,
    required: true,
    ref: 'User',
  },
  users: [
    {
      type: ObjectId, ref: 'User',
    },
  ],
  password: String,
  recentChatTime: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Room', roomSchema);
