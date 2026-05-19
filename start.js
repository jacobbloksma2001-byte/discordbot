const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const packageJsonPath = path.join(root, 'package.json');
const deployPath = path.join(root, 'deploy.js');
const indexPath = path.join(root, 'index.js');

function run(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} stopte met code ${code}`));
    });
  });
}

async function main() {
  try {
    if (fs.existsSync(packageJsonPath)) {
      console.log('[BOOT] package.json gevonden, npm install wordt uitgevoerd...');
      await run('npm', ['install']);
    }

    if (fs.existsSync(deployPath)) {
      console.log('[BOOT] deploy.js gevonden, commands worden gedeployed...');
      await run('node', ['deploy.js']);
    } else {
      console.log('[BOOT] Geen deploy.js gevonden, deploy wordt overgeslagen.');
    }

    if (!fs.existsSync(indexPath)) {
      throw new Error('index.js niet gevonden.');
    }

    console.log('[BOOT] Bot wordt gestart...');
    const bot = spawn('node', ['index.js'], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    });

    bot.on('close', code => {
      process.exit(code ?? 0);
    });

    bot.on('error', error => {
      console.error('[BOOT] Kon index.js niet starten:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('[BOOT] Opstartfout:', error);
    process.exit(1);
  }
}

main();