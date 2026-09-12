const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function findCscExe() {
  const candidates = [
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function buildNativeHelper() {
  const projectRoot = path.join(__dirname, "..");
  const src = path.join(projectRoot, "backend", "native-helper", "rovyl-helper.cs");
  const binDir = path.join(projectRoot, "resources", "bin");
  const out1 = path.join(binDir, "rovyl-helper.exe");
  const out2 = path.join(projectRoot, "backend", "rovyl-helper.exe");

  if (!fs.existsSync(src)) {
    console.error("[build-native-helper] Source file missing:", src);
    process.exit(1);
  }

  const csc = findCscExe();
  if (!csc) {
    console.warn("[build-native-helper] csc.exe not found on system. Skipping native helper build.");
    return;
  }

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  console.log("[build-native-helper] Compiling rovyl-helper.cs with", csc);
  try {
    execFileSync(
      csc,
      [
        "/target:winexe",
        "/platform:x64",
        "/optimize+",
        "/r:System.Windows.Forms.dll",
        "/r:System.Drawing.dll",
        `/out:${out1}`,
        src,
      ],
      { stdio: "inherit" },
    );
    fs.copyFileSync(out1, out2);
    console.log("[build-native-helper] Compiled successfully:", out1);
  } catch (err) {
    console.error("[build-native-helper] Compilation failed:", err.message);
  }
}

buildNativeHelper();
