package com.acr.agent.review

import com.acr.agent.settings.ACRAgentSettingsState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import java.io.File

class ACRAgentCliRunner(private val project: Project) {
    private val log = Logger.getInstance(ACRAgentCliRunner::class.java)

    fun runReviewBeforeCommit(commitRange: String): Boolean {
        val state = ACRAgentSettingsState.getInstance()
        val configPath = state.configFilePath.takeIf { it.isNotBlank() }
            ?: return false.also {
                showWarning("ACR Agent configuration file is not set. Open Settings > Tools > ACR Agent.")
            }

        val command = locateCliExecutable(File(configPath))
            ?: return false.also {
                showWarning("Unable to locate acr-agent CLI. Build the core package and set ACR_AGENT_CLI if necessary.")
            }

        val workingDirectory = File(configPath).parentFile
        val fullCommand = buildCommand(command, commitRange, state.defaultPrompt)

        return try {
            val processBuilder = ProcessBuilder(fullCommand)
            processBuilder.directory(workingDirectory)
            if (state.activeModelId.isNotBlank()) {
                processBuilder.environment()["ACR_AGENT_MODEL"] = state.activeModelId
            }
            val process = processBuilder.start()
            val stdout = process.inputStream.bufferedReader().readText()
            val stderr = process.errorStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            if (exitCode != 0) {
                showWarning("ACR Agent review failed: $stderr")
                false
            } else {
                val result = Messages.showYesNoDialog(
                    project,
                    stdout,
                    "ACR Agent Review",
                    "Proceed with Commit",
                    "Cancel Commit",
                    null
                )
                result == Messages.YES
            }
        } catch (exception: Exception) {
            log.warn("Failed to run acr-agent", exception)
            showWarning("Failed to execute acr-agent CLI: ${exception.message}")
            false
        }
    }

    private fun buildCommand(baseCommand: List<String>, commitRange: String, prompt: String): MutableList<String> {
        return baseCommand.toMutableList().apply {
            add("review")
            add("--range")
            add(commitRange)
            add("--staged")
            if (prompt.isNotBlank()) {
                add("--prompt")
                add(prompt)
            }
        }
    }

    private fun locateCliExecutable(configFile: File): List<String>? {
        val env = System.getenv("ACR_AGENT_CLI")
        if (!env.isNullOrBlank()) {
            val candidate = File(env)
            if (candidate.exists()) return listOf(candidate.absolutePath)
        }

        val configDir = configFile.parentFile ?: return null
        val repoRoot = configDir.parentFile ?: configDir
        val distCli = File(repoRoot, "core/dist/cli.js")
        if (distCli.exists()) return listOf(System.getProperty("nodejs.path", "node"), distCli.absolutePath)

        val npmCli = File(configDir, "node_modules/.bin/acr-agent")
        if (npmCli.exists()) return listOf(npmCli.absolutePath)

        return null
    }

    private fun showWarning(message: String) {
        Messages.showWarningDialog(project, message, "ACR Agent")
    }
}
