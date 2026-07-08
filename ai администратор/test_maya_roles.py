import unittest

import maya_roles


class MayaRolesTests(unittest.TestCase):
    def test_panel_role_priority(self):
        self.assertEqual(
            maya_roles.resolve_panel_role(
                tg_id=948205934,
                is_founder=True,
                is_admin=True,
                is_master=True,
                manager_ids=set(),
            ),
            maya_roles.ROLE_OWNER,
        )
        self.assertEqual(
            maya_roles.resolve_panel_role(
                tg_id=339683535,
                is_founder=False,
                is_admin=True,
                is_master=False,
                manager_ids=set(),
            ),
            maya_roles.ROLE_MANAGER,
        )
        self.assertEqual(
            maya_roles.resolve_panel_role(
                tg_id=1461621,
                is_founder=False,
                is_admin=False,
                is_master=True,
                manager_ids=set(),
            ),
            maya_roles.ROLE_MASTER,
        )

    def test_panel_permissions_are_explicit(self):
        owner = maya_roles.panel_permissions(maya_roles.ROLE_OWNER)
        manager = maya_roles.panel_permissions(maya_roles.ROLE_MANAGER)
        master = maya_roles.panel_permissions(maya_roles.ROLE_MASTER)

        self.assertTrue(owner["pii_export"])
        self.assertTrue(owner["roles"])
        self.assertTrue(manager["analytics"])
        self.assertFalse(manager["pii_export"])
        self.assertTrue(master["master_tools"])
        self.assertFalse(master["analytics"])

    def test_cashier_master_can_redeem_without_owner_rights(self):
        perms = maya_roles.panel_permissions(
            maya_roles.ROLE_MASTER,
            is_master=True,
            is_cashier=True,
        )

        self.assertTrue(perms["master_tools"])
        self.assertTrue(perms["redeem"])
        self.assertFalse(perms["analytics"])

    def test_staff_surface_is_restricted_to_staff_ai_roles(self):
        self.assertFalse(maya_roles.ai_role_can_use_staff_surface(maya_roles.ROLE_CLIENT))
        self.assertTrue(maya_roles.ai_role_can_use_staff_surface(maya_roles.ROLE_MASTER))
        self.assertTrue(maya_roles.ai_role_can_use_staff_surface(maya_roles.ROLE_MANAGER))
        self.assertTrue(maya_roles.ai_role_can_use_staff_surface(maya_roles.ROLE_FOUNDER))

    def test_unknown_surface_falls_back_to_client(self):
        self.assertEqual(maya_roles.normalize_surface("staff"), maya_roles.SURFACE_STAFF)
        self.assertEqual(maya_roles.normalize_surface("owner"), maya_roles.SURFACE_OWNER)
        self.assertEqual(maya_roles.normalize_surface("unknown"), maya_roles.SURFACE_CLIENT)
        self.assertEqual(maya_roles.normalize_surface(None), maya_roles.SURFACE_CLIENT)


if __name__ == "__main__":
    unittest.main()
