import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    kotlin("jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.transitrix.intellij"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion"))
        testFramework(TestFrameworkType.Platform)
        // Required by the IntelliJ Platform Gradle Plugin v2 for the
        // `instrumentCode` task (form/NotNull bytecode instrumentation);
        // without it the build fails with "No Java Compiler dependency found".
        instrumentationTools()
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = providers.gradleProperty("pluginUntilBuild")
        }
    }
}

kotlin {
    // IntelliJ Platform 2024.2 (platformVersion) runs on JBR 21 and requires
    // sourceCompatibility 21; building against an older toolchain fails
    // instrumentCode. Keep this in lockstep with platformVersion in gradle.properties.
    jvmToolchain(21)
}

// Pull the browser-safe `@transitrix/diagrams` bundle produced by
// `node scripts/build-webview-bundle.mjs` into the plugin jar under
// `webview/`. JCEF reads transitrix-render.js / .css from the classloader at
// runtime, splices them into `webview/host.html`, and ships the combined HTML
// to JBCefBrowser.loadHTML(). The bundle is the single source of notation
// rendering — no JVM-side parsers (ADR 0001).
val webviewBundleDir = rootProject.layout.projectDirectory
    .dir("../packages/diagrams/dist/webview")

// Dedicated output dir for the synced bundle. Kept OUT of build/generated —
// the IntelliJ Platform plugin's compileJava/instrumentation also writes under
// build/generated, and sharing it makes processResources consume compileJava's
// output without a declared dependency (Gradle 8.x validation error).
val webviewResourcesDir = layout.buildDirectory.dir("webview-resources")

val syncWebviewBundle by tasks.registering(Copy::class) {
    description = "Copy the @transitrix/diagrams webview bundle into the plugin resources."
    from(webviewBundleDir) {
        include("transitrix-render.js", "transitrix-render.css")
    }
    into(webviewResourcesDir.map { it.dir("webview") })
    // Fail loudly if the bundle hasn't been built yet — the Node side owns
    // the build (node scripts/build-webview-bundle.mjs) and Gradle simply
    // packages the outputs. Surfacing the cause beats a silent empty jar.
    doFirst {
        val js = file("$webviewBundleDir/transitrix-render.js")
        val css = file("$webviewBundleDir/transitrix-render.css")
        if (!js.exists() || !css.exists()) {
            throw GradleException(
                "Webview bundle missing at $webviewBundleDir. " +
                    "Run `node scripts/build-webview-bundle.mjs` from the repo root first " +
                    "(see docs/adr/0001-intellij-mvp-tech-choice.md step 2)."
            )
        }
    }
}

sourceSets {
    named("main") {
        resources {
            srcDir(webviewResourcesDir)
        }
    }
}

tasks.named("processResources") {
    dependsOn(syncWebviewBundle)
}

tasks {
    wrapper {
        gradleVersion = providers.gradleProperty("gradleVersion").get()
    }
}
