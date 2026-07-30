import unittest

import identity_utils


class IdentityRegressionTests(unittest.TestCase):
    def test_session_tg_user_preserves_full_telegram_profile(self):
        tg_user = identity_utils.session_tg_user({
            "chat_id": 948205934,
            "display_name": "Stas Mosin",
            "tg_first_name": "Stas",
            "tg_last_name": "Mosin",
            "tg_username": "stasmosin",
            "tg_photo_url": "https://t.me/i/userpic/320/stas.jpg",
        })

        self.assertEqual(tg_user["id"], 948205934)
        self.assertEqual(tg_user["first_name"], "Stas")
        self.assertEqual(tg_user["last_name"], "Mosin")
        self.assertEqual(tg_user["full_name"], "Stas Mosin")
        self.assertEqual(tg_user["display_name"], "Stas Mosin")
        self.assertEqual(tg_user["username"], "stasmosin")
        self.assertEqual(tg_user["photo_url"], "https://t.me/i/userpic/320/stas.jpg")

    def test_session_tg_user_uses_display_name_as_fallback(self):
        tg_user = identity_utils.session_tg_user({
            "chat_id": 339683535,
            "display_name": "Anton Admin",
        })

        self.assertEqual(tg_user["first_name"], "Anton")
        self.assertEqual(tg_user["last_name"], "Admin")
        self.assertEqual(tg_user["full_name"], "Anton Admin")

    def test_panel_role_only_founder_is_owner(self):
        self.assertEqual(
            identity_utils.resolve_panel_role(
                tg_id=948205934,
                is_founder=True,
                is_admin=True,
                is_master=True,
                manager_ids=set(),
            ),
            "owner",
        )
        self.assertEqual(
            identity_utils.resolve_panel_role(
                tg_id=339683535,
                is_founder=False,
                is_admin=True,
                is_master=False,
                manager_ids=set(),
            ),
            "manager",
        )
        self.assertEqual(
            identity_utils.resolve_panel_role(
                tg_id=1461621,
                is_founder=False,
                is_admin=False,
                is_master=True,
                manager_ids=set(),
            ),
            "master",
        )

    def test_ai_role_separates_founder_admin_master_client(self):
        self.assertEqual(
            identity_utils.resolve_ai_role(is_founder=True, is_admin=True, is_master=True),
            "founder",
        )
        self.assertEqual(
            identity_utils.resolve_ai_role(is_founder=False, is_admin=True, is_master=False),
            "manager",
        )
        self.assertEqual(
            identity_utils.resolve_ai_role(is_founder=False, is_admin=False, is_master=True),
            "master",
        )
        self.assertEqual(
            identity_utils.resolve_ai_role(is_founder=False, is_admin=False, is_master=False),
            "client",
        )


if __name__ == "__main__":
    unittest.main()
