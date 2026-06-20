const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({ host: '10.1.0.58', username: 'bobdivx', password: 'Qs-T++l646464' });
    console.log('Pulling dev image...');
    const pull = await ssh.execCommand('docker pull bobdivx/popcorn-frontend:dev');
    console.log(pull.stdout);
    
    console.log('Restarting popcornn-client...');
    const restart = await ssh.execCommand('docker restart popcornn-client');
    console.log(restart.stdout);
    
    ssh.dispose();
  } catch (error) {
    console.error(error);
  }
}
run();
