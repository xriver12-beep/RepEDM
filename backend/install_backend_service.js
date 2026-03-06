const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'WintonEDM_Backend',
  description: 'WintonEDM Backend API Service',
  script: path.join(__dirname, 'src', 'app.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function() {
  console.log('WintonEDM_Backend Service Installed');
  svc.start();
});

svc.on('alreadyinstalled', function() {
  console.log('WintonEDM_Backend Service is already installed.');
  svc.start();
});

svc.on('start', function() {
  console.log('WintonEDM_Backend Service started.');
});

svc.install();
