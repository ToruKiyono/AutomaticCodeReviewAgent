package com.acr.agent.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

@State(name = "ACRAgentSettingsState", storages = [Storage("acrAgent.xml")])
@Service(Service.Level.APP)
class ACRAgentSettingsState : PersistentStateComponent<ACRAgentSettingsState> {
    var defaultPrompt: String = "Please review the commit diff with focus on Go best practices."
    var autoReview: Boolean = true
    var activeModelId: String = ""
    var configFilePath: String = ""

    override fun getState(): ACRAgentSettingsState = this

    override fun loadState(state: ACRAgentSettingsState) {
        XmlSerializerUtil.copyBean(state, this)
    }

    companion object {
        fun getInstance(): ACRAgentSettingsState = com.intellij.openapi.application.ApplicationManager.getApplication()
            .getService(ACRAgentSettingsState::class.java)
    }
}
