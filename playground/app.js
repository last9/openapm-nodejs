/**
 * Make sure to build the library before you run the app
 * Also, comment out the things that you are not using. For example, you can comment out the mysql code if you are
 * not testing or developing for the same
 *  */
require('dotenv').config();
var express = require('express');
var { OpenAPM } = require('../dist/src/index.js');
var pg = require('pg');
// var mysql2 = require('mysql2');

const openapm = new OpenAPM({
  extractLabels: {
    tenant: {
      from: 'params',
      key: 'org',
      mask: ':org'
    }
  },
  levitateConfig: {
    orgSlug: process.env.LEVITATE_ORG_SLUG,
    dataSourceName: process.env.LEVITATE_DATASOURCE,
    refreshTokens: {
      write: process.env.LEVITATE_WRITE_REFRESH_TOKEN
    }
  },
  customPathsToMask: [/\b\d+(?:,\d+)*\b/gm],
  excludeDefaultLabels: ['host', 'program'],
  additionalLabels: ['slug']
});

openapm.instrument('express');
openapm.instrument('postgres');

const app = express();
let client;
// const pool = mysql2.createPool(
//   `mysql://express-app:password@127.0.0.1/express` //  If this throws an error, Change the db url to the one you're running on your machine locally or the testing instance you might have hosted.
// );

app.get('/result', async (req, res) => {
  // pool.getConnection((err, conn) => {
  //   conn.query(
  //     {
  //       sql: 'SELECT SLEEP(RAND() * 10)'
  //     },
  //     (...args) => {
  //       console.log(args);
  //     }
  //   );
  // });
  // await client.query(`INSERT INTO "users" (username) VALUES ('JohnDoe');`);
  let result;
  try {
    result = await client.query(
      "select * from users where username='JohnDoe';"
    );
  } catch (error) {}

  res.status(200).json({
    users: result?.rows
  });
});

app.get('/organizations/:org/users', (req, res) => {
  console.log(req.params.org);

  res.status(200).json({});
});

app.get('/cancel/:ids', (req, res) => {
  counter.inc();
  res.status(200).json({});
});

app.post('/api/v2/product/search/:term', (req, res) => {
  res.status(200).json({});
});

app.all('/api/v1/slug/:slug', (req, res) => {
  setOpenAPMLabels({ slug: req.params.slug });
  res.status(200).json({});
});

server = app.listen(3000, async () => {
  client = new pg.Client('postgresql://tester:password@localhost:5432/testdb'); //  If this throws an error, Change the db url to the one you're running on your machine locally or the testing instance you might have hosted.

  await client.connect();
  console.log('serving at 3000');
});

const gracefullyShutdownServer = async () => {
  await client.end();
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
