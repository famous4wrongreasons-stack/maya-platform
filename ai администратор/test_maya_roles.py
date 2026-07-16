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

    def test_allowed_surfaces_for_owner_manager_master_client(self):
        owner = maya_roles.allowed_surfaces_for_panel_role(
            maya_roles.ROLE_OWNER,
            is_founder=True,
            is_master=True,
        )
        manager = maya_roles.allowed_surfaces_for_panel_role(maya_roles.ROLE_MANAGER)
        master = maya_roles.allowed_surfaces_for_panel_role(maya_roles.ROLE_MASTER)
        client = maya_roles.allowed_surfaces_for_panel_role(None)

        self.assertIn(maya_roles.SURFACE_CLIENT, owner)
        self.assertIn(maya_roles.SURFACE_STAFF, owner)
        self.assertIn(maya_roles.SURFACE_OWNER, owner)
        self.assertIn(maya_roles.SURFACE_ADMIN, owner)
        self.assertIn(maya_roles.SURFACE_MASTER, owner)
        self.assertIn(maya_roles.SURFACE_ADMIN, manager)
        self.assertNotIn(maya_roles.SURFACE_OWNER, manager)
        self.assertIn(maya_roles.SURFACE_MASTER, master)
        self.assertNotIn(maya_roles.SURFACE_ADMIN, master)
        self.assertEqual(client, [maya_roles.SURFACE_CLIENT, maya_roles.SURFACE_VOICE])

    def test_brain_profiles_follow_surface_not_only_identity(self):
        self.assertEqual(
            maya_roles.brain_profile_for_surface(
                maya_roles.ROLE_OWNER,
                maya_roles.SURFACE_CLIENT,
                is_founder=True,
            ),
            maya_roles.BRAIN_CLIENT,
        )
        self.assertEqual(
            maya_roles.brain_profile_for_surface(
                maya_roles.ROLE_OWNER,
                maya_roles.SURFACE_STAFF,
                is_founder=True,
            ),
            maya_roles.BRAIN_FOUNDER,
        )
        self.assertEqual(
            maya_roles.brain_profile_for_surface(
                maya_roles.ROLE_MANAGER,
                maya_roles.SURFACE_ADMIN,
            ),
            maya_roles.BRAIN_ADMIN,
        )
        self.assertEqual(
            maya_roles.brain_profile_for_surface(
                maya_roles.ROLE_OWNER,
                maya_roles.SURFACE_TEAM,
                is_founder=True,
            ),
            maya_roles.BRAIN_TEAM,
        )
        self.assertEqual(
            maya_roles.brain_profile_for_surface(
                maya_roles.ROLE_OWNER,
                maya_roles.SURFACE_MASTER,
                is_founder=True,
            ),
            maya_roles.BRAIN_MASTER,
        )

    def test_surface_brain_profiles_are_keyed_by_allowed_surfaces(self):
        profiles = maya_roles.surface_brain_profiles(
            maya_roles.ROLE_OWNER,
            is_founder=True,
            is_master=False,
        )

        self.assertEqual(profiles[maya_roles.SURFACE_CLIENT], maya_roles.BRAIN_CLIENT)
        self.assertEqual(profiles[maya_roles.SURFACE_STAFF], maya_roles.BRAIN_FOUNDER)
        self.assertEqual(profiles[maya_roles.SURFACE_OWNER], maya_roles.BRAIN_FOUNDER)
        self.assertEqual(profiles[maya_roles.SURFACE_ADMIN], maya_roles.BRAIN_ADMIN)
        self.assertEqual(profiles[maya_roles.SURFACE_TEAM], maya_roles.BRAIN_TEAM)
        self.assertNotIn(maya_roles.SURFACE_MASTER, profiles)


if __name__ == "__main__":
    unittest.main()
