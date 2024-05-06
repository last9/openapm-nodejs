const { OpenAPM } = require('../../dist');

const apm = new OpenAPM({
  addtionalLabels: ['slug']
});

apm.instrument('nextjs');
