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
  password: String,
  createdAt: {
    type: Date,
    default: new Date(Date.now() + 9 * 60 * 60 * 1000),
  },
});

module.exports = mongoose.model('Room', roomSchema);
