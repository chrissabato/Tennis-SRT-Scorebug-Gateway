module.exports = {
  apps: [{
    name: 'tennis-gateway',
    script: 'server.js',
    kill_timeout: 6000,   // wait 6s for graceful shutdown before SIGKILL
    restart_delay: 1000,
  }],
};
