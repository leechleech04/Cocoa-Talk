const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const nunjucks = require('nunjucks');
const mongoose = require('mongoose');
const User = require('./schemas/user');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const axios = require('axios');

dotenv.config();

const app = express();
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
  .then(() => console.log('MongoDB connected'))
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
app.use(
  session({
    resave: false,
    saveUninitialized: false,
    secret: process.env.COOKIE_SECRET,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 60 * 60 * 1000,
    },
    name: 'session-cookie',
  })
);
app.use(passport.session());

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
      if (result.password == password) {
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

passport.deserializeUser((user, done) => {
  User.findById(user._id)
    .then((user) => {
      delete user.password;
      done(null, user);
    })
    .catch((err) => done(err));
});

app.get('/', (req, res) => {
  if (req.user) {
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

app.listen(app.get('port'), () => {
  console.log(app.get('port'), '번 포트에서 대기 중');
});
