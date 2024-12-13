const mongoose = require('mongoose');

const { Schema } = mongoose;
const userSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  nickname: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: new Date(Date.now() + 9 * 60 * 60 * 1000),
  },
});

module.exports = mongoose.model('User', userSchema);
