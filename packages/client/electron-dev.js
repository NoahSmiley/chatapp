// Launches Electron properly by clearing env vars that pnpm sets.
// ELECTRON_RUN_AS_NODE=1 (set by pnpm's bin wrapper) makes Electron
// run as plain Node.js instead of an actual Electron app.
const { spawn } = require("child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.NODE_PATH;
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env,
  cwd: __dirname,
});

child.on("close", (code) => process.exit(code ?? 1));
