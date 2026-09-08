import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../web/", import.meta.url));
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.PORT ||= process.env.APP_PORT || "5173";
process.env.OLLAMA_MODEL ||= "gemma4:e4b";
const command = process.argv[2];
const cargoBin = join(
  process.env.CARGO_HOME || join(homedir(), ".cargo"),
  "bin",
);
if (existsSync(cargoBin))
  process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH || ""}`;
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32")
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
  }
}
function run(executable, args, cwd = root) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    children.add(child);
    child.on("error", (error) => {
      console.error(error.message);
      stop(1);
      resolve(1);
    });
    child.on("exit", (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
}
const npm = (task) =>
  run(process.execPath, [
    process.env.npm_execpath,
    "--prefix",
    web,
    ...(task === "install" ? ["ci"] : ["run", task]),
  ]);
const cargo = (task) =>
  run("cargo", [
    task,
    "--manifest-path",
    "backend/Cargo.toml",
    "--locked",
    ...(task === "build" || task === "run" ? ["--release"] : []),
  ]);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
if (
  ["dev", "build", "test", "start", "api"].includes(command) &&
  spawnSync("cargo", ["--version"], { windowsHide: true }).status !== 0
) {
  console.error(
    "Rustが見つかりません。READMEのセットアップに従ってRustをインストールしてください。WindowsではC++ Build ToolsとWindows SDKも必要です。",
  );
  process.exitCode = 1;
} else if (command === "dev") {
  const code = await npm("build");
  if (code) stop(code);
  else await Promise.race([
    cargo("run"),
    run(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "build", "--watch"],
      web,
    ),
  ]).then(stop);
} else if (command === "start" || command === "api") {
  stop(await cargo("run"));
} else if (command === "build") {
  const code = await npm("build");
  stop(code || (await cargo("build")));
} else if (command === "test") {
  const code = await npm("test");
  stop(code || (await cargo("test")));
} else if (command === "install" || command === "typecheck") {
  stop(await npm(command));
} else if (command === "build:web") {
  stop(await npm("build"));
} else if (command === "test:web") {
  stop(await npm("test"));
} else throw new Error(`Unknown command: ${command}`);
