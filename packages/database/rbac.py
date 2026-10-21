"""
RBAC Matrix and Permission Enforcement for RevOps SaaS.
Implements the 7 production-hardened roles from V17.6:
👑 CEO, 📋 РОП, 💼 KAM, 📞 SDR, 🌐 CMO, 💳 CFO, ⚙️ Admin.
"""

import enum

from .models import UserRole


class Permission(str, enum.Enum):
    # Dashboards & Cockpits
    VIEW_EXECUTIVE_SUMMARY = "view:executive_summary"
    VIEW_COMPANY_PULSE = "view:company_pulse"
    VIEW_ROP_COCKPIT = "view:rop_cockpit"
    VIEW_RISK_RADAR = "view:risk_radar"
    
    # Deals & Pipeline
    VIEW_ALL_DEALS = "view:all_deals"
    VIEW_OWN_DEALS = "view:own_deals"
    EDIT_DEALS = "edit:deals"
    REASSIGN_DEALS = "reassign:deals"
    
    # Diagnostics & Financials
    VIEW_SEVEN_SINS = "view:seven_sins"
    RUN_SIMULATOR = "run:monte_carlo_simulator"
    VIEW_ATTRIBUTION = "view:w_shaped_attribution"
    VIEW_PAYROLL = "view:payroll_and_motivation"
    VIEW_UNIT_ECONOMICS = "view:unit_economics"
    
    # Speech AI & Call Quality
    VIEW_ALL_CALLS = "view:all_calls"
    VIEW_OWN_CALLS = "view:own_calls"
    TRIGGER_AI_AUDIT = "trigger:ai_speech_audit"
    
    # Settings & Administration
    MANAGE_INTEGRATIONS = "manage:integrations"
    MANAGE_USERS = "manage:users"
    MANAGE_SUBSCRIPTION = "manage:subscription"


# Precise mapping of 7 roles to permissions (tested against V17.6 QA Suite)
ROLE_PERMISSIONS: dict[UserRole, set[Permission]] = {
    UserRole.CEO: {
        Permission.VIEW_EXECUTIVE_SUMMARY,
        Permission.VIEW_COMPANY_PULSE,
        Permission.VIEW_ROP_COCKPIT,
        Permission.VIEW_RISK_RADAR,
        Permission.VIEW_ALL_DEALS,
        Permission.EDIT_DEALS,
        Permission.REASSIGN_DEALS,
        Permission.VIEW_SEVEN_SINS,
        Permission.RUN_SIMULATOR,
        Permission.VIEW_ATTRIBUTION,
        Permission.VIEW_PAYROLL,
        Permission.VIEW_UNIT_ECONOMICS,
        Permission.VIEW_ALL_CALLS,
        Permission.TRIGGER_AI_AUDIT,
        Permission.MANAGE_INTEGRATIONS,
        Permission.MANAGE_USERS,
        Permission.MANAGE_SUBSCRIPTION,
    },
    UserRole.ROP: {
        Permission.VIEW_COMPANY_PULSE,
        Permission.VIEW_ROP_COCKPIT,
        Permission.VIEW_RISK_RADAR,
        Permission.VIEW_ALL_DEALS,
        Permission.EDIT_DEALS,
        Permission.REASSIGN_DEALS,
        Permission.VIEW_SEVEN_SINS,
        Permission.RUN_SIMULATOR,
        Permission.VIEW_ALL_CALLS,
        Permission.TRIGGER_AI_AUDIT,
    },
    UserRole.KAM: {
        Permission.VIEW_OWN_DEALS,
        Permission.EDIT_DEALS,
        Permission.VIEW_OWN_CALLS,
    },
    UserRole.SDR: {
        Permission.VIEW_OWN_DEALS,
        Permission.EDIT_DEALS,
        Permission.VIEW_OWN_CALLS,
    },
    UserRole.CMO: {
        Permission.VIEW_COMPANY_PULSE,
        Permission.VIEW_ATTRIBUTION,
        Permission.VIEW_UNIT_ECONOMICS,
        Permission.VIEW_ALL_DEALS,
        Permission.VIEW_SEVEN_SINS,
    },
    UserRole.CFO: {
        Permission.VIEW_EXECUTIVE_SUMMARY,
        Permission.VIEW_COMPANY_PULSE,
        Permission.VIEW_SEVEN_SINS,
        Permission.RUN_SIMULATOR,
        Permission.VIEW_PAYROLL,
        Permission.VIEW_UNIT_ECONOMICS,
        Permission.VIEW_ALL_DEALS,
    },
    UserRole.ADMIN: {
        Permission.VIEW_EXECUTIVE_SUMMARY,
        Permission.VIEW_COMPANY_PULSE,
        Permission.VIEW_ROP_COCKPIT,
        Permission.VIEW_RISK_RADAR,
        Permission.VIEW_ALL_DEALS,
        Permission.EDIT_DEALS,
        Permission.REASSIGN_DEALS,
        Permission.VIEW_SEVEN_SINS,
        Permission.RUN_SIMULATOR,
        Permission.VIEW_ATTRIBUTION,
        Permission.VIEW_PAYROLL,
        Permission.VIEW_UNIT_ECONOMICS,
        Permission.VIEW_ALL_CALLS,
        Permission.TRIGGER_AI_AUDIT,
        Permission.MANAGE_INTEGRATIONS,
        Permission.MANAGE_USERS,
        Permission.MANAGE_SUBSCRIPTION,
    },
}


def has_permission(role: UserRole, permission: Permission) -> bool:
    """Check if the given role has the specific permission."""
    role_perms = ROLE_PERMISSIONS.get(role, set())
    return permission in role_perms


def can_access_deal(user_role: UserRole, user_id: str, deal_assigned_user_id: str) -> bool:
    """
    Checks Row-Level Access to a specific deal:
    - Executive / Managerial roles (CEO, ROP, Admin, CFO, CMO) can access all deals.
    - Reps (KAM, SDR) can only view deals assigned to them.
    """
    if user_role in {UserRole.CEO, UserRole.ROP, UserRole.ADMIN, UserRole.CFO, UserRole.CMO}:
        return True
    return user_id == deal_assigned_user_id
