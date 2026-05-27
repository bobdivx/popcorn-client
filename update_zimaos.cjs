const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({ host: '10.1.0.58', username: 'bobdivx', password: '***REMOVED***' });
    const res = await ssh.execCommand('docker ps -a --format "{{.Names}}" | grep -i popcorn');
    console.log(res.stdout);
    ssh.dispose();
  } catch (error) {
    console.error(error);
  }
}
run();
