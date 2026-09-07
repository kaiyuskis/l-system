import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../web/", import.meta.url));
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.PORT ||= process.env.APP_PORT || "3000";
process.env.API_PORT = process.env.PORT;
process.env.OLLAMA_MODEL ||= "gemma4:latest";
const command = process.argv[2];
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
    "Rustが見つかりません。Dockerなら docker compose up --build だけで起動できます。ネイティブ開発はREADMEのRustセットアップを行ってください。",
  );
  process.exitCode = 1;
} else if (command === "dev") {
  await Promise.race([
    cargo("run"),
    run(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--strictPort"],
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
} else if (command === "docker:test") {
  stop(
    await run("docker", [
      "build",
      "--target",
      "test",
      "-t",
      "komorebi-tests",
      ".",
    ]),
  );
} else throw new Error(`Unknown command: ${command}`);
