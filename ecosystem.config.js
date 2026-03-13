module.exports = {
  apps: [{
    name: 'tennis-gateway',
    script: 'server.js',
    kill_timeout: 6000,   // wait 6s for graceful shutdown before SIGKILL
    restart_delay: 5000,  // wait 5s after exit before restarting (prevent EADDRINUSE loops)
  }],
};
