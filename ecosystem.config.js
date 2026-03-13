module.exports = {
  apps: [{
    name: 'tennis-gateway',
    script: 'server.js',
    kill_timeout: 6000,      // wait 6s for graceful shutdown before SIGKILL
    restart_delay: 5000,     // wait 5s after exit before restarting
    stop_exit_codes: [0],    // don't restart on clean exit (e.g. EADDRINUSE handled gracefully)
  }],
};
