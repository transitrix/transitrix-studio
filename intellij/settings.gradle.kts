// IntelliJ Platform plugin for Transitrix Studio.
// Isolated Gradle build — sibling to extension/ and packages/diagrams/.
// The repo's VS Code build never invokes Gradle and this build never invokes
// the Node toolchain (per the IntelliJ MVP technology choice ADR).

rootProject.name = "transitrix-intellij"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // IntelliJ Platform Gradle Plugin v2 fetches IDE artifacts via its
        // own repository helpers — declared in build.gradle.kts.
    }
}
