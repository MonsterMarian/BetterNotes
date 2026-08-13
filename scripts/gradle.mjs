/**
 * Spustí Gradle s JDK, které si projekt nese v `android/gradle.properties`.
 *
 * Proč vůbec: `gradlew.bat` je jen zavaděč a ten potřebuje JVM dřív, než se
 * na `org.gradle.java.home` vůbec podívá. Na počítači bez `JAVA_HOME` skončí
 * hláškou "JAVA_HOME is not set" a build se nerozjede, i když JDK vedle leží.
 *
 * Cesta se čte z `gradle.properties`, ne odsud - jinak by byly dvě a jednou
 * by se rozešly.
 *
 * Spuštění: node scripts/gradle.mjs assembleRelease
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROPS = path.join("android", "gradle.properties");

function javaHome() {
  // Systémové nastavení má přednost - kdo si JDK nastavil sám, ví proč.
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const line = readFileSync(PROPS, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("org.gradle.java.home="));
  if (!line) {
    console.error(`V ${PROPS} chybí org.gradle.java.home a JAVA_HOME není nastavené.`);
    process.exit(1);
  }
  return line.slice(line.indexOf("=") + 1).trim();
}

const home = javaHome();
if (!existsSync(path.join(home, "bin", "java.exe")) && !existsSync(path.join(home, "bin", "java"))) {
  console.error(`JDK v ${home} není - oprav org.gradle.java.home v ${PROPS}.`);
  process.exit(1);
}

const res = spawnSync(path.resolve("android", "gradlew.bat"), process.argv.slice(2), {
  cwd: "android",
  stdio: "inherit",
  shell: true,
  env: { ...process.env, JAVA_HOME: home },
});

process.exit(res.status ?? 1);
