/**
 * Make sure to build the library before you run the app
 * Also, comment out the things that you are not using. For example, you can comment out the mysql code if you are
 * not testing or developing for the same
 *  */
require('dotenv').config();
var express = require('express');
var { OpenAPM } = require('../dist/index.js');
var mysql2 = require('mysql2');

const openapm = new OpenAPM({
  extractLabels: {
    tenant: {
      from: 'params',
      key: 'org',
      mask: ':org'
    }
  },
  levitateConfig: {
    orgSlug: process.env['LEVITATE_ORG_SLUG'],
    dataSourceName: process.env['LEVITATE_DATASOURCE'],
    refreshTokens: {
      write: process.env['LEVITATE_WRITE_REFRESH_TOKEN']
    }
  },
  customPathsToMask: [/\b\d+(?:,\d+)*\b/gm],
  excludeDefaultLabels: ['host', 'program']
});

openapm.instrument('express');
openapm.instrument('mysql');

const app = express();

const pool = mysql2.createPool(
  `mysql://express-app:password@127.0.0.1/express` //  If this throws an error, Change the db url to the one you're running on your machine locally or the testing instance you might have hosted.
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

app.get('/cancel/:ids', (req, res) => {
  res.status(200).json({});
});

app.post('/api/v2/product/search/:term', (req, res) => {
  res.status(200).json({});
});

app.all('/api/v1/slug/:slug', (req, res) => {
  res.status(200).json({});
});

const server = app.listen(3000, () => {
  console.log('serving at 3000');
});

const gracefullyShutdownServer = () => {
  server.close(() => {
    openapm
      .shutdown()
      .then(() => {
        console.log('Server gracefully shutdown');
        process.exit(0);
      })
      .catch((err) => {
        console.log(err);
        process.exit(1);
      });
  });
};

process.on('SIGINT', gracefullyShutdownServer);
process.on('SIGTERM', gracefullyShutdownServer);
