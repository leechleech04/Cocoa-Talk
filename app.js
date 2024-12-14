const express = require('express');
const app = express();
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const nunjucks = require('nunjucks');
const mongoose = require('mongoose');
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

const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

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
  if (req.user._id == req.params.id) {
    const rooms = await Room.find({ users: req.params.id })
      .populate('owner')
      .populate('users');
    res.render('room-list', { rooms });
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
