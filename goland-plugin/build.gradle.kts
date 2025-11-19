plugins {
    id("org.jetbrains.intellij") version "1.16.0"
    kotlin("jvm") version "1.9.23"
}

group = "com.acr.agent"
version = "0.1.0"

repositories {
    mavenCentral()
}

intellij {
    version.set("2023.3")
    type.set("GO")
    plugins.set(listOf("Git4Idea"))
}

tasks {
    patchPluginXml {
        sinceBuild.set("233")
        untilBuild.set(null as String?)
    }

    compileKotlin {
        kotlinOptions.jvmTarget = "17"
    }

    compileJava {
        targetCompatibility = "17"
        sourceCompatibility = "17"
    }
}
