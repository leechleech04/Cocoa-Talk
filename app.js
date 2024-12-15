const express = require('express');
const app = express();
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const nunjucks = require('nunjucks');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const User = require('./schemas/user');
const Room = require('./schemas/room');
const Chat = require('./schemas/chat');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const axios = require('axios');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const { createServer } = require('http');
const { Server } = require('socket.io');
const server = createServer(app);
const io = new Server(server);
const cors = require('cors');

dotenv.config();

app.set('port', process.env.PORT || 3000);
app.set('view engine', 'html');

nunjucks.configure('views', {
  express: app,
  watch: true,
});

const connectDB = mongoose
  .connect(process.env.MONGO_URI, {
    dbName: 'cocoatalk',
  })
  .then(() => {
    console.log('MongoDB connected');
    server.listen(app.get('port'), () => {
      console.log(app.get('port'), '번 포트에서 대기 중');
    });
  })
  .catch((err) => console.error(err));

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error', error);
});

mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected. Try to reconnect');
  connectDB();
});

app.use(morgan('dev'));
app.use('/', express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(passport.initialize());
const sessionMiddleware = session({
  resave: false,
  saveUninitialized: false,
  secret: process.env.COOKIE_SECRET,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 60 * 60 * 1000,
  },
  name: 'session-cookie',
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: 'cocoatalk',
  }),
});
app.use(sessionMiddleware);
app.use(passport.session());
app.use(
  cors({
    origin: '*',
  })
);

const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

app.set('io', io);
const roomNamespace = io.of('/room');
roomNamespace.use(wrap(sessionMiddleware));
const chatNamespace = io.of('/chat');
chatNamespace.use(wrap(sessionMiddleware));

io.on('connection', (socket) => {
  const user = socket.request.session.passport.user;
  console.log('New client connected', user);
  socket.on('disconnect', () => {
    console.log('Client disconnected', user);
  });
  socket.on('error', (error) => {
    console.error(error);
  });
});

roomNamespace.on('connection', (socket) => {
  const user = socket.request.session.passport.user;
  console.log('New client connected room namespace', user);
  socket.on('disconnect', () => {
    console.log('Client disconnected room namespace', user);
  });
  socket.on('error', (error) => {
    console.error(error);
  });
});

chatNamespace.on('connection', (socket) => {
  const user = socket.request.session.passport.user;
  console.log('New client connected on chat namespace', user);
  socket.on('join', async (data) => {
    const room = await Room.findById(data.roomId);
    if (room.users.some((one) => one._id.toString() === user._id.toString())) {
      socket.join(data.roomId);
    }
  });
  socket.on('chat', async (data) => {
    const document = await Chat.create({
      room: new mongoose.Types.ObjectId(data.roomId),
      user: user._id,
      content: data.message,
    });
    const re = await document.populate('room');
    const result = await re.populate('user');
    chatNamespace.to(data.roomId).emit('chat', result);
  });
  socket.on('disconnect', () => {
    console.log('Client disconnected on chat namespace', user);
  });
  socket.on('error', (error) => {
    console.error(error);
  });
});

passport.use(
  new LocalStrategy(
    {
      usernameField: 'id',
      passwordField: 'password',
    },
    async (id, password, done) => {
      let result = await User.findOne({ id });
      if (!result) {
        return done(null, false, { message: '존재하지 않는 아이디입니다.' });
      }
      if (await bcrypt.compare(password, result.password)) {
        return done(null, result);
      } else {
        return done(null, false, { message: '비밀번호가 옳지 않습니다.' });
      }
    }
  )
);

passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { _id: user._id, userId: user.id, username: user.nickname });
  });
});

passport.deserializeUser(async (user, done) => {
  try {
    const result = await User.findById(user._id);
    if (result) {
      delete result.password;
    }
    done(null, result);
  } catch {
    (err) => done(err);
  }
});

app.get('/', (req, res) => {
  if (req.user) {
    console.log(req.user);
    res.render('main', { user: req.user });
  } else {
    res.redirect('login');
  }
});

app.get('/login', async (req, res) => {
  res.render('login');
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (error, user, info) => {
    if (error) {
      return next(error);
    }
    if (!user) {
      return res.json({ msg: info.message, result: false });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      return res.status(200).json({ url: '/', result: true });
    });
  })(req, res, next);
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/duplication', async (req, res) => {
  const result = await User.findOne({ id: req.body.id });
  res.json({ result: result ? false : true });
});

app.post('/register', async (req, res) => {
  if (
    req.body.password.length === 0 ||
    req.body.id.length === 0 ||
    req.body.nickname.length === 0 ||
    req.body.password !== req.body.secPassword
  ) {
    console.log('회원가입에 실패했습니다.');
    res.json({ msg: '회원가입에 실패했습니다.', result: false });
  } else {
    const hashedPw = await bcrypt.hash(req.body.password, 10);
    await User.create({
      id: req.body.id,
      password: hashedPw,
      nickname: req.body.nickname,
    });
    console.log('회원가입에 성공했습니다.');
    res.json({ msg: '회원가입에 성공했습니다.', result: true });
  }
});

app.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy();
    res.json({ success: true });
  });
});

app.get('/room-list/:id', async (req, res) => {
  if (req.user && req.user._id == req.params.id) {
    const rooms = await Room.find({ users: req.params.id })
      .populate('owner')
      .populate('users');
    res.render('room-list', { rooms });
  } else {
    res.redirect('/');
  }
});

app.get('/room/:id', async (req, res) => {
  const room = await Room.findById(req.params.id)
    .populate('owner')
    .populate('users');
  if (req.user) {
    if (
      !room.users.some(
        (user) => user._id.toString() === req.user._id.toString()
      )
    ) {
      await room.updateOne({ $push: { users: req.user._id } });
      Chat.create({
        room: new mongoose.Types.ObjectId(req.params.id),
        user: req.user._id,
        content: `${req.user.nickname}(${req.user.id})님이 입장하셨습니다.`,
        notification: true,
      });
      const io = req.app.get('io');
      io.of('/chat').to(req.params.id).emit('room-enter', { user: req.user });
    }
    const chats = await Chat.find({
      room: new mongoose.Types.ObjectId(req.params.id),
    })
      .populate('room')
      .populate('user');
    return res.render('chat', { room, chats, user: req.user });
  } else {
    return res.redirect('/');
  }
});

app.post('/room-exit/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (room.users.includes(req.user._id)) {
    await room.updateOne({ $pull: { users: req.user._id } });
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.delete('/room-delete/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (room.owner.toString() === req.user._id.toString()) {
    await Chat.deleteMany({ room: new mongoose.Types.ObjectId(req.params.id) });
    await room.deleteOne();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post('/create-room', async (req, res) => {
  if (req.user) {
    const room = await Room.create({
      title: req.body.title,
      owner: req.user._id,
      users: [req.user._id],
    });
    if (req.body.password) {
      const hashed = await bcrypt.hash(req.body.password, 10);
      await room.updateOne({ password: hashed });
    }
    res.redirect(`/room/${room._id}`);
  } else {
    res.redirect('/login');
  }
});

app.get('/search-room', async (req, res) => {
  if (req.user) {
    const rooms = await Room.find().populate('owner').populate('users');
    res.render('search-room', { user: req.user, rooms });
  } else {
    res.redirect('/login');
  }
});

app.post('/search-room', async (req, res) => {
  const searchOption = [
    {
      $search: {
        index: 'room_title_index',
        text: {
          query: req.body.roomName,
          path: 'title',
        },
      },
    },
  ];
  const result = await Room.aggregate(searchOption);
  const populatedResult = await Room.populate(result, [
    { path: 'owner' },
    { path: 'users' },
  ]);
  res.render('search-room', { user: req.user, rooms: populatedResult });
});

app.post('/room-pw', async (req, res) => {
  const id = req.body.id;
  const pw = req.body.password;
  const room = await Room.findById(id);
  if (await bcrypt.compare(pw, room.password)) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.put('/room-title/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (room.owner.toString() === req.user._id.toString()) {
    await room.updateOne({ title: req.body.title });
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.use((req, res, next) => {
  const error = new Error(`${req.method} ${req.url} 라우터가 없습니다.`);
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.locals.message = err.message;
  res.locals.error = process.env.NODE_ENV !== 'production' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});
