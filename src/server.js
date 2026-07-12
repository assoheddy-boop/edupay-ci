require('dotenv/config');
const express = require('express');
const path = require('path');
const http = require('http');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const app = require('./app');
const { initSocket } = require('./config/socket');
const { startCronJobs } = require('./jobs/cron');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

initSocket(server);
startCronJobs();

server.listen(PORT, () => {
  console.log(`EduPay CI — http://localhost:${PORT}`);
});

module.exports = server;
