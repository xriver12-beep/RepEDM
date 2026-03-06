const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a dummy file
fs.writeFileSync('test.html', '<html><body><div data-zone="z1"></div></body></html>');

const boundary = '--------------------------' + Date.now().toString(16);

const postData = 
`--${boundary}\r\n` +
`Content-Disposition: form-data; name="file"; filename="test.html"\r\n` +
`Content-Type: text/html\r\n` +
`\r\n` +
fs.readFileSync('test.html') + `\r\n` +
`--${boundary}--`;

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/templates-modern/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
