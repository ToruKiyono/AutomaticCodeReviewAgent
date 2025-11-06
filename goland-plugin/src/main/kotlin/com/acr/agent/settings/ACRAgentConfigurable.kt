package com.acr.agent.settings

import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.JComponent
import javax.swing.JPanel

class ACRAgentConfigurable : Configurable {
    private val panel = JPanel(GridBagLayout())
    private val promptField = JBTextField()
    private val autoReviewCheckbox = JBCheckBox("Automatically run review before commit")
    private val modelIdField = JBTextField()
    private val configFileChooser = TextFieldWithBrowseButton()

    init {
        buildUi()
    }

    override fun createComponent(): JComponent = panel

    override fun isModified(): Boolean {
        val state = ACRAgentSettingsState.getInstance()
        return promptField.text != state.defaultPrompt ||
            autoReviewCheckbox.isSelected != state.autoReview ||
            modelIdField.text != state.activeModelId ||
            configFileChooser.text != state.configFilePath
    }

    @Throws(ConfigurationException::class)
    override fun apply() {
        val state = ACRAgentSettingsState.getInstance()
        state.defaultPrompt = promptField.text
        state.autoReview = autoReviewCheckbox.isSelected
        state.activeModelId = modelIdField.text
        state.configFilePath = configFileChooser.text
    }

    override fun reset() {
        val state = ACRAgentSettingsState.getInstance()
        promptField.text = state.defaultPrompt
        autoReviewCheckbox.isSelected = state.autoReview
        modelIdField.text = state.activeModelId
        configFileChooser.text = state.configFilePath
    }

    override fun getDisplayName(): String = "ACR Agent"

    private fun buildUi() {
        val constraints = GridBagConstraints().apply {
            fill = GridBagConstraints.HORIZONTAL
            weightx = 1.0
            gridx = 0
            gridy = 0
            anchor = GridBagConstraints.NORTHWEST
            insets = java.awt.Insets(4, 4, 4, 4)
        }

        panel.add(JBLabel("Default review prompt"), constraints)
        constraints.gridy++
        panel.add(promptField, constraints)

        constraints.gridy++
        panel.add(JBLabel("Preferred model id"), constraints)
        constraints.gridy++
        panel.add(modelIdField, constraints)

        constraints.gridy++
        panel.add(autoReviewCheckbox, constraints)

        constraints.gridy++
        panel.add(JBLabel("Core config file (.acr-agent.config.json)"), constraints)
        constraints.gridy++
        configFileChooser.addBrowseFolderListener(
            "Select Config File",
            "Choose the workspace configuration file shared with the VSCode extension.",
            ProjectManager.getInstance().defaultProject,
            FileChooserDescriptor(true, false, false, false, false, false)
        )
        panel.add(configFileChooser, constraints)
    }
}
