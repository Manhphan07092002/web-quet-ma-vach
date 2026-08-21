const selfsigned = require('selfsigned');

(async () => {
  const attrs = [{ name: 'commonName', value: '192.168.88.95' }];
  const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
  console.log("Keys available:", Object.keys(pems));
})();
