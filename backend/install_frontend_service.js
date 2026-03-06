const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'WintonEDM_Frontend',
  description: 'WintonEDM Frontend Static Server',
  script: 'C:\\WintonEDM\\html-frontend\\server.js'
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function() {
  console.log('WintonEDM_Frontend Service Installed');
  svc.start();
});

svc.on('alreadyinstalled', function() {
  console.log('WintonEDM_Frontend Service is already installed.');
  svc.start();
});

svc.on('start', function() {
  console.log('WintonEDM_Frontend Service started.');
});

svc.install();
