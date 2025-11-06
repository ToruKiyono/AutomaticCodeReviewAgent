package com.acr.agent.review

import com.acr.agent.settings.ACRAgentSettingsState
import com.intellij.openapi.vcs.CheckinProjectPanel
import com.intellij.openapi.vcs.checkin.CheckinHandler
import com.intellij.openapi.vcs.checkin.CheckinHandlerFactory

class ACRAgentCheckinHandlerFactory : CheckinHandlerFactory() {
    override fun createHandler(panel: CheckinProjectPanel): CheckinHandler {
        return object : CheckinHandler() {
            override fun beforeCheckin(): ReturnResult {
                val state = ACRAgentSettingsState.getInstance()
                if (!state.autoReview) {
                    return ReturnResult.COMMIT
                }

                val proceed = ACRAgentCliRunner(panel.project).runReviewBeforeCommit("HEAD")
                return if (proceed) ReturnResult.COMMIT else ReturnResult.CANCEL
            }
        }
    }
}
