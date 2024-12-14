const mongoose = require('mongoose');

const { Schema } = mongoose;
const {
  Types: { ObjectId },
} = Schema;
const chatSchema = new Schema({
  room: {
    type: ObjectId,
    required: true,
    ref: 'Room',
  },
  user: {
    type: ObjectId,
    required: true,
    ref: 'User',
  },
  content: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: new Date(Date.now() + 9 * 60 * 60 * 1000),
  },
});

module.exports = mongoose.model('Chat', chatSchema);
