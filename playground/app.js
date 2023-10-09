var express = require('express');
var { OpenAPM } = require('../dist/cjs/index.js');
var mysql2 = require('mysql2');
const openapm = new OpenAPM({
  extractLabels: {
    tenant: {
      from: ['params'],
      key: 'org',
      mask: ':org'
    }
  }
});

openapm.instrument('mysql');

const app = express();
app.use(openapm.REDMiddleware);

// This doesn't work by default. Need instructions to make this work.
const pool = mysql2.createPool(
  `mysql://express-app:password@127.0.0.1/express`
);

app.get('/result', (req, res) => {
  pool.getConnection((err, conn) => {
    conn.query(
      {
        sql: 'SELECT SLEEP(RAND() * 10)'
      },
      (...args) => {
        console.log(args);
      }
    );
  });

  res.status(200).json({});
});

app.get('/organizations/:org/users', (req, res) => {
  console.log(req.params['org']);

  res.status(200).json({});
});

app.listen(3000, () => {
  console.log('serving at 3000');
});
