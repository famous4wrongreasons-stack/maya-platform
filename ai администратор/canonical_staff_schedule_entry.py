"""R03: a legacy schedule request initiates only a canonical-app handoff.

The existing authenticated StaffScheduleCommand/AiApprovalRequest flow owns
preview, exact approval, A15 execution and reconciliation. No native identity
or prose confirmation is translated into mutation authority here.
"""


def staff_schedule_handoff():
    return {
        "success": False,
        "accepted": False,
        "retry_allowed": False,
        "status": "canonical_entry_required",
        "error": "canonical_staff_schedule_required",
        "message": (
            "Изменение графика доступно в MAYA после входа: "
            "откройте приложение и подтвердите точное изменение. "
            "https://malesthetic.pro/app/"
        ),
        "canonical_url": "https://malesthetic.pro/app/",
    }
