/**
 * Spustí Gradle s JDK, které si projekt nese v `android/gradle.properties`.
 *
 * Proč vůbec: `gradlew.bat` je jen zavaděč a ten potřebuje JVM dřív, než se
 * na `org.gradle.java.home` vůbec podívá. Na počítači bez `JAVA_HOME` skončí
 * hláškou "JAVA_HOME is not set" a build se nerozjede, i když JDK vedle leží.
 *
 * Zbytek prostředí (a proč se odklánějí sockety) řeší `jdk.mjs`.
 *
 * Spuštění: node scripts/gradle.mjs assembleRelease
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { javaEnv } from "./jdk.mjs";

const res = spawnSync(path.resolve("android", "gradlew.bat"), process.argv.slice(2), {
  cwd: "android",
  stdio: "inherit",
  shell: true,
  env: javaEnv(),
});

process.exit(res.status ?? 1);
