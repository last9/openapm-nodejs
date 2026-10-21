// Acceptance probe for #58: this Node runtime must reject a chain through a
// compromised eMudhra intermediate with CERT_REVOKED (nodejs/node#66871)
// while still trusting a normal HTTPS endpoint. Exits non-zero otherwise.
import https from 'node:https';

const BLOCKED = 'https://dv-g3b-emudhra.we-have-a-problem.com/';
const TRUSTED = 'https://registry.npmjs.org/';

const connect = (url) =>
  new Promise((resolve) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) =>
      resolve({ ok: false, code: err.code ?? err.message })
    );
  });

const blocked = await connect(BLOCKED);
const trusted = await connect(TRUSTED);

console.log(`process.version ${process.version}`);
console.log(`${BLOCKED} ${JSON.stringify(blocked)}`);
console.log(`${TRUSTED} ${JSON.stringify(trusted)}`);

if (blocked.code !== 'CERT_REVOKED' || !trusted.ok) {
  console.error(
    'TLS probe failed: expected CERT_REVOKED for the eMudhra chain and success for the trusted endpoint'
  );
  process.exit(1);
}
console.log('TLS probe passed');
