/**
 * Kde je JDK a s jakým prostředím spouštět nástroje, které ho potřebují.
 *
 * Sdílí to `gradle.mjs` i `sign-apk.mjs` - obojí volá dávku (`gradlew.bat`,
 * `apksigner.bat`), která si sama hledá Javu a bez `JAVA_HOME` skončí dřív,
 * než cokoli udělá.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const PROPS = path.join("android", "gradle.properties");

/** Hodnota vlastnosti z gradle.properties, nebo `null`. */
export function gradleProp(name) {
  if (!existsSync(PROPS)) return null;
  const line = readFileSync(PROPS, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim() : null;
}

/**
 * JDK projektu. Cesta se čte z `gradle.properties`, ne odsud - jinak by byly
 * dvě a jednou by se rozešly.
 */
export function javaHome() {
  // Systémové nastavení má přednost - kdo si JDK nastavil sám, ví proč.
  const home = process.env.JAVA_HOME || gradleProp("org.gradle.java.home");
  if (!home) {
    console.error(`V ${PROPS} chybí org.gradle.java.home a JAVA_HOME není nastavené.`);
    process.exit(1);
  }
  if (!existsSync(path.join(home, "bin", "java.exe")) && !existsSync(path.join(home, "bin", "java"))) {
    console.error(`JDK v ${home} není - oprav org.gradle.java.home v ${PROPS}.`);
    process.exit(1);
  }
  return home;
}

/**
 * Prostředí pro nástroje z JDK.
 *
 * Kromě `JAVA_HOME` odklání adresář pro Unix domain sockety. Java na Windows
 * přes ně dělá socket pár pro `Selector` a soubor socketu vzniká v systémovém
 * temp adresáři. Když je ten adresář takový, že na něm `bind` projde
 * a `connect` ne, spadne build na nicneříkající
 *
 *     java.io.IOException: Unable to establish loopback connection
 *
 * a nepomůže `--no-daemon` ani jiný selector provider.
 *
 * Přes `JAVA_TOOL_OPTIONS`, ne přes `GRADLE_OPTS` ani `-Dorg.gradle.jvmargs`:
 * Gradle daemona forkuje jako samostatný proces a argumenty z příkazové řádky
 * se k němu nedostanou - build pak umře o krok dál na "Could not receive
 * a message from the daemon". `JAVA_TOOL_OPTIONS` si přečte každé JVM, které
 * nastartuje, takže pokryje zavaděč i daemona naráz.
 */
export function javaEnv() {
  const socketDir = path.join(homedir(), ".gradle", "sockets");
  mkdirSync(socketDir, { recursive: true });
  const socketOpt = `-Djdk.net.unixdomain.tmpdir=${socketDir}`;

  return {
    ...process.env,
    JAVA_HOME: javaHome(),
    JAVA_TOOL_OPTIONS: [process.env.JAVA_TOOL_OPTIONS, socketOpt].filter(Boolean).join(" "),
  };
}
