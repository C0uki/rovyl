const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distHtml = path.join(projectRoot, "dist", "index.html");
const helperExe = path.join(projectRoot, "resources", "bin", "rovyl-helper.exe");

if (!fs.existsSync(distHtml)) {
  console.log("[Rovyl] Building production assets first...");
  execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
}

if (!fs.existsSync(helperExe)) {
  require("./build-native-helper.cjs");
}

const env = { ...process.env, NODE_ENV: "production" };
const electronPath = require("electron");

console.log("[Rovyl] Starting Rovyl in lightweight mode (Zero DevServer, Zero Vite)...");
const child = spawn(electronPath, ["."], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code || 0);
});
