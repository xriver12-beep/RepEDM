const net = require('net');

const host = 'Pmg-slave.winton.com.tw';
const port = 26;

console.log(`Testing connection to ${host}:${port}...`);

const client = new net.Socket();

const timeout = 10000; // 10 seconds

const timer = setTimeout(() => {
    console.log('Timeout reached. Destroying socket.');
    client.destroy();
}, timeout);

client.connect(port, host, () => {
    console.log('Connected to server!');
});

client.on('data', (data) => {
    console.log('Received data: ' + data.toString());
    clearTimeout(timer);
    client.destroy(); // We just want to see the greeting
});

client.on('close', () => {
    console.log('Connection closed');
    clearTimeout(timer);
});

client.on('error', (err) => {
    console.error('Connection error:', err);
    clearTimeout(timer);
});
