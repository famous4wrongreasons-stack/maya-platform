import importlib
import json
import sys
import types
import unittest


def _load_owner_ai(*, reactivation_payload: dict | None):
    fake_analytics = types.ModuleType("analytics")
    fake_analytics.resolve_period = lambda period, date_from=None, date_to=None: (
        "2026-06-09",
        "2026-07-08",
        "last 30",
    )
    def fake_business_summary(date_from, date_to, *args, **kwargs):
        if date_from == "2026-06-09":
            return {
                "from": "2026-06-09",
                "to": "2026-07-08",
                "total_gross": 60000,
                "visits": 30,
                "avg_check": 2000,
                "salary_total": 22000,
                "masters": [
                    {
                        "staff_id": 1,
                        "name": "Мастер 1",
                        "gross": 40000,
                        "salary": 14000,
                        "visits": 20,
                        "avg_check": 2000,
                        "percent": 35,
                        "is_owner": False,
                    },
                    {
                        "staff_id": 2,
                        "name": "Мастер 2",
                        "gross": 20000,
                        "salary": 8000,
                        "visits": 10,
                        "avg_check": 2000,
                        "percent": 40,
                        "is_owner": False,
                    },
                ],
            }
        return {"total_gross": 1000, "visits": 1, "avg_check": 1000}

    fake_analytics.business_summary = fake_business_summary
    fake_analytics.business_pulse = lambda *args, **kwargs: {
        "health": "ok",
        "metrics": {
            "gross": {"value": 120000, "delta": -5000, "delta_pct": -4},
            "visits": {"value": 60, "delta": 6, "delta_pct": 11},
            "avg_check": {"value": 2000, "delta": 100, "delta_pct": 5},
        },
        "anomaly": None,
    }
    fake_analytics.top_services = lambda date_from, date_to, limit=12: (
        [
            {"title": "Стрижка", "count": 20, "sum": 40000},
            {"title": "Борода", "count": 5, "sum": 10000},
        ]
        if date_from == "2026-06-09"
        else [
            {"title": "Стрижка", "count": 18, "sum": 36000},
            {"title": "Борода", "count": 9, "sum": 18000},
        ]
    )

    fake_database = types.ModuleType("database")
    owner_actions = [
        {
            "id": 1,
            "source": "owner_os",
            "job": "cycle",
            "title": "Подогреть спрос",
            "status": "done",
            "created_at": "2026-07-07T10:00:00",
            "result_due_at": "2020-01-01T10:00:00",
            "evaluated_at": "2026-07-08T11:00:00",
            "summary": {"sent": 3},
            "impact_status": "positive_signal",
            "impact": {"status": "positive_signal", "message": "Есть положительный сигнал."},
            "payload": {},
        }
    ]
    fake_database.dashboard_metrics = lambda days=30: {
        "subscriptions": {"expiring_soon": 2, "active": 9}
    }
    fake_database.active_sold_gift_certs = lambda: {"count": 1, "value_rub": 10000}
    fake_database.get_setting = lambda key, default=None: (
        json.dumps(reactivation_payload, ensure_ascii=False)
        if key == "reactivation_last" and reactivation_payload is not None
        else default
    )
    def fake_create_owner_action(job, title="", **kwargs):
        action_id = max((int(it.get("id") or 0) for it in owner_actions), default=0) + 1
        owner_actions.insert(0, {
            "id": action_id,
            "source": kwargs.get("source") or "owner_os",
            "job": job,
            "title": title,
            "status": kwargs.get("status") or "running",
            "created_at": "2026-07-08T10:00:00",
            "result_due_at": kwargs.get("result_due_at"),
            "summary": {},
            "payload": kwargs.get("payload") or {},
        })
        return action_id

    def fake_update_owner_control_task(action_id, action, **kwargs):
        for item in owner_actions:
            if int(item["id"]) != int(action_id):
                continue
            if item.get("source") != "owner_control":
                return None
            if action in ("complete", "done", "finish"):
                item["status"] = "done"
                item["summary"] = {"manual": True, "last_action": action}
            elif action in ("cancel", "canceled", "cancelled"):
                item["status"] = "canceled"
                item["summary"] = {"manual": True, "last_action": action}
            elif action in ("postpone", "snooze", "delay"):
                item["status"] = "pending"
                item["result_due_at"] = kwargs.get("due_at") or item.get("result_due_at")
                item["payload"]["due_at"] = item["result_due_at"]
            elif action in ("reopen", "open"):
                item["status"] = "pending"
            elif action in ("revision", "return", "redo", "rework"):
                item["status"] = "running"
                item["payload"]["assignment_work_state"] = "revision"
                item["payload"]["assignment_work_updated_at"] = "2026-07-08T10:20:00"
                item["payload"]["assignment_work_actor_role"] = "owner"
                item["payload"]["assignment_work_actor_name"] = "Владелец"
                item["payload"]["assignment_work_note"] = kwargs.get("note") or ""
                item["summary"] = dict(item.get("summary") or {})
                item["summary"]["manual"] = True
                item["summary"]["last_action"] = action
                item["summary"]["assignment_work_state"] = "revision"
                item["summary"]["assignment_work_actor_role"] = "owner"
                item["summary"]["assignment_work_actor_name"] = "Владелец"
                item["summary"]["owner_revision_note"] = kwargs.get("note") or ""
            elif action in ("assign", "reassign"):
                item["payload"]["assigned_to"] = kwargs.get("assigned_to") or item["payload"].get("assigned_to") or "owner"
                item["payload"]["assignee_name"] = kwargs.get("assignee_name") or ""
                if item["payload"]["assigned_to"] in ("admin", "master", "team"):
                    item["payload"]["assignment_delivery_channel"] = "team_chat"
                    item["payload"]["assignment_delivery_state"] = "queued"
                elif item["payload"]["assigned_to"] == "maya":
                    item["payload"]["assignment_delivery_channel"] = "maya_queue"
                    item["payload"]["assignment_delivery_state"] = "internal"
                else:
                    item["payload"]["assignment_delivery_channel"] = "owner_control"
                    item["payload"]["assignment_delivery_state"] = "owner_only"
                item["summary"] = {
                    "manual": True,
                    "last_action": action,
                    "assigned_to": item["payload"]["assigned_to"],
                    "assignee_name": item["payload"]["assignee_name"],
                    "assignment_delivery_channel": item["payload"]["assignment_delivery_channel"],
                    "assignment_delivery_state": item["payload"]["assignment_delivery_state"],
                }
            return json.loads(json.dumps(item, ensure_ascii=False))
        return None

    def fake_update_owner_assignment_work_state(action_id, state, **kwargs):
        state_map = {
            "accept": "accepted",
            "accepted": "accepted",
            "start": "running",
            "run": "running",
            "running": "running",
            "done": "done",
            "complete": "done",
            "finish": "done",
            "blocked": "blocked",
        }
        normalized = state_map.get(state)
        if not normalized:
            return None
        for item in owner_actions:
            if int(item["id"]) != int(action_id):
                continue
            if item.get("source") != "owner_control":
                return None
            item["status"] = "running" if item.get("status") == "pending" else item.get("status")
            item["payload"]["assignment_work_state"] = normalized
            item["payload"]["assignment_work_actor_role"] = kwargs.get("actor_role") or ""
            item["payload"]["assignment_work_actor_name"] = kwargs.get("actor_name") or ""
            item["payload"]["assignment_work_updated_at"] = "2026-07-08T10:10:00"
            item["summary"] = dict(item.get("summary") or {})
            item["summary"]["assignment_work_state"] = normalized
            item["summary"]["assignment_work_actor_role"] = kwargs.get("actor_role") or ""
            item["summary"]["assignment_work_actor_name"] = kwargs.get("actor_name") or ""
            return json.loads(json.dumps(item, ensure_ascii=False))
        return None

    fake_database.create_owner_action = fake_create_owner_action
    fake_database.update_owner_control_task = fake_update_owner_control_task
    fake_database.update_owner_assignment_work_state = fake_update_owner_assignment_work_state
    fake_database.list_owner_actions = lambda limit=8: owner_actions[:limit]
    fake_database.evaluate_due_owner_actions = lambda limit=5: 0

    fake_yclients = types.ModuleType("yclients")

    class _FakeYClientsAPI:
        def get_working_masters(self, day):
            return [
                {"id": 1, "name": "Мастер 1", "is_working": True},
                {"id": 2, "name": "Мастер 2", "is_working": True},
            ]

        def get_company_records(self, start_date, end_date):
            return [{"staff_id": 1}, {"staff_id": 1}]

    fake_yclients.YClientsAPI = _FakeYClientsAPI

    sys.modules["analytics"] = fake_analytics
    sys.modules["database"] = fake_database
    sys.modules["yclients"] = fake_yclients
    sys.modules.pop("owner_ai", None)
    mod = importlib.import_module("owner_ai")
    mod._avg_cache.update(val=None, ts=0.0)
    mod._summary30_cache.update(val=None, ts=0.0)
    return mod


class OwnerAITests(unittest.TestCase):
    def test_owner_action_payload_is_card_only(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        payload = owner_ai.owner_action_payload("reactivation", potential_rub=12000)

        self.assertEqual(payload["kind"], "run_job")
        self.assertEqual(payload["job"], "reactivation")
        self.assertEqual(payload["potential_rub"], 12000)
        self.assertNotIn("execute", payload)
        self.assertIsNone(owner_ai.owner_action_payload("unknown"))

    def test_return_candidates_empty_state_does_not_invent_money(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        result = owner_ai.return_candidates()

        self.assertIsNone(result["count"])
        self.assertNotIn("potential_return_revenue_rub", result)
        self.assertEqual(result["action"], "reactivation")
        self.assertIn("Ещё не считалось", result["note"])

    def test_daily_briefing_ranks_money_and_prepares_action_card(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        brief = owner_ai.daily_briefing()

        self.assertEqual(brief["today"]["booked"], 2)
        self.assertEqual(brief["today"]["avg_check_rub"], 2000)
        self.assertEqual(brief["today"]["expected_revenue_rub"], 4000)
        self.assertEqual(brief["today"]["free_capacity_today"], 14)
        self.assertEqual(brief["top_priority"]["type"], "empty_windows")
        self.assertEqual(brief["top_priority"]["potential_rub"], 28000)
        self.assertTrue(brief["top_priority"]["estimate"])
        self.assertEqual(brief["top_action"]["kind"], "run_job")
        self.assertEqual(brief["top_action"]["job"], "cycle")
        self.assertTrue(brief["next_best_actions"])
        self.assertTrue(brief["execution_plan"]["steps"])
        self.assertEqual(
            brief["execution_plan"]["summary"]["steps_count"],
            len(brief["execution_plan"]["steps"]),
        )
        self.assertTrue(brief["task_center"]["tasks"])
        self.assertEqual(
            brief["task_center"]["summary"]["tasks_count"],
            len(brief["task_center"]["tasks"]),
        )
        self.assertTrue(brief["control_focus"]["items"])
        self.assertEqual(brief["control_focus"]["summary"]["focus_count"], len(brief["control_focus"]["items"]))
        self.assertTrue(brief["control_queue"])
        self.assertIn("оценка", brief["note"].lower())

    def test_command_center_builds_stable_owner_os_contract(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        center = owner_ai.command_center()

        self.assertEqual(center["version"], "owner_command_center_v1")
        self.assertTrue(center["read_only"])
        self.assertIn(center["status"], {"ok", "warn", "risk"})
        self.assertGreater(center["summary"]["money_at_stake_rub"], 0)
        self.assertEqual(center["summary"]["booked_today"], 2)
        self.assertEqual(center["summary"]["free_capacity_today"], 14)
        keys = {section["key"] for section in center["sections"]}
        self.assertEqual(
            {
                "today",
                "money",
                "autonomous_director",
                "kpi_scorecard",
                "financial_director",
                "plan_fact",
                "control",
                "owner_review",
                "risks",
                "clients",
                "services",
                "masters",
                "actions",
                "automations",
                "automation_queue",
                "journal",
            },
            keys,
        )
        self.assertEqual(center["summary"]["daily_target_rub"], 2000)
        self.assertIsNotNone(center["summary"]["plan_progress_pct"])
        self.assertEqual(center["plan_fact"]["daily_target_rub"], 2000)
        self.assertEqual(center["summary"]["top_profit_master"]["name"], "Мастер 1")
        self.assertEqual(center["master_performance"]["top_profit_master"]["profit_after_salary_rub"], 26000)
        self.assertTrue(center["next_best_actions"])
        self.assertTrue(center["control_queue"])
        self.assertTrue(center["attention_feed"])
        self.assertEqual(center["summary"]["attention_count"], len(center["attention_feed"]))
        self.assertEqual(center["summary"]["top_control"], center["control_queue"][0])
        self.assertTrue(center["execution_plan"]["steps"])
        self.assertEqual(
            center["summary"]["execution_steps_count"],
            center["execution_plan"]["summary"]["steps_count"],
        )
        self.assertLessEqual(center["execution_plan"]["summary"]["steps_count"], 3)
        self.assertTrue(center["execution_plan"]["summary"]["actionable_count"])
        self.assertTrue(center["task_center"]["tasks"])
        self.assertEqual(center["summary"]["task_count"], center["task_center"]["summary"]["tasks_count"])
        self.assertIn("overdue_task_count", center["summary"])
        self.assertIn("owner_review_count", center["summary"])
        self.assertIn("automation_queue_count", center["summary"])
        self.assertIn("kpi_score", center["summary"])
        self.assertIn("autonomous_task_candidates_count", center["summary"])
        self.assertIn("autonomous_open_tasks_count", center["summary"])
        self.assertIn("approval_required_count", center["summary"])
        self.assertIn("projected_month_gross_rub", center["summary"])
        self.assertIn("projected_month_contribution_after_salary_rub", center["summary"])
        self.assertEqual(center["autonomous_director"]["version"], "maya_os_v2_autonomous_director")
        self.assertIn(center["autonomous_director"]["mode"], {"supervised_autopilot"})
        self.assertIn(center["kpi_scorecard"]["status"], {"ok", "warn", "risk"})
        self.assertGreaterEqual(center["kpi_scorecard"]["score"], 0)
        self.assertLessEqual(center["kpi_scorecard"]["score"], 100)
        self.assertIn("projected_month_gross_rub", center["financial_director"]["summary"])
        self.assertEqual(center["approval_matrix"]["version"], "approval_matrix_v1")
        self.assertTrue(center["approval_matrix"]["rows"])
        self.assertEqual(
            center["summary"]["autonomous_task_candidates_count"],
            len(center["autonomous_director"]["task_candidates"]),
        )
        self.assertTrue([
            task for task in center["task_center"]["tasks"]
            if task.get("assigned_to") in ("owner", "maya")
        ])
        self.assertTrue(center["control_focus"]["items"])
        self.assertEqual(center["summary"]["control_focus_count"], center["control_focus"]["summary"]["focus_count"])
        self.assertIn("control", {section["key"] for section in center["sections"]})
        self.assertEqual(center["journal"][0]["job"], "cycle")
        self.assertEqual(center["next_best_actions"][0]["kind"], "run_job")
        self.assertNotIn("execute", center["next_best_actions"][0])
        self.assertTrue(center["automation_status"])
        self.assertTrue(center["automation_queue"]["items"])
        self.assertTrue(center["automation_queue"]["summary"]["items_count"])
        self.assertEqual(len(center["automation_status"]), 5)
        self.assertIn(
            "automation_attention_count",
            center["summary"],
        )
        self.assertTrue([
            row for row in center["automation_status"]
            if row.get("job") == "cycle" and row.get("recommended")
        ])
        cycle_auto = [
            row for row in center["automation_status"]
            if row.get("job") == "cycle"
        ][0]
        self.assertEqual(cycle_auto["last_action_id"], 1)
        self.assertEqual(cycle_auto["last_evaluated_at"], "2026-07-08T11:00:00")
        self.assertEqual(cycle_auto["last_summary"]["sent"], 3)
        self.assertEqual(cycle_auto["last_impact_status"], "positive_signal")
        self.assertIn("положительный", cycle_auto["last_impact"]["message"])

    def test_autonomous_director_tick_creates_only_internal_control_tasks(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})
        before = owner_ai.command_center()
        open_candidates = [
            row for row in before["autonomous_director"]["task_candidates"]
            if row.get("safe_autocreate") and not row.get("in_control")
        ]

        result = owner_ai.run_autonomous_director_tick(created_by=948205934, limit=10)
        again = owner_ai.run_autonomous_director_tick(created_by=948205934, limit=10)

        self.assertTrue(open_candidates)
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "supervised_autopilot")
        self.assertGreater(result["created_count"], 0)
        self.assertLessEqual(result["created_count"], 10)
        self.assertEqual(again["created_count"], 0)
        self.assertGreaterEqual(again["skipped_count"], 0)
        for row in result["created"]:
            task = row["task"]
            payload = task["payload"]
            self.assertEqual(task["source"], "owner_control")
            self.assertEqual(task["job"], "control_task")
            self.assertEqual(task["status"], "pending")
            self.assertEqual(payload["signal_kind"], "autonomy")
            self.assertEqual(payload["signal_source"], "maya_os_v2")
            self.assertTrue(payload["signal_key"].startswith("autonomy:"))
            self.assertTrue(payload["safe_autocreate"])
        self.assertTrue([
            task for task in result["center"]["task_center"]["tasks"]
            if task.get("safe_autocreate")
        ])

    def test_command_center_survives_one_block_failure(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        def boom():
            raise RuntimeError("assets unavailable")

        owner_ai.expiring_assets = boom
        center = owner_ai.command_center()

        self.assertEqual(center["version"], "owner_command_center_v1")
        self.assertTrue(center["errors"])
        self.assertIn("clients", {section["key"] for section in center["sections"]})
        self.assertIn(center["status"], {"warn", "risk"})

    def test_owner_control_task_appears_in_command_center_queue(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Проверить план-факт вечером",
            detail="Сравнить прогноз дня с ручным планом.",
            priority="high",
            due_in_days=1,
            potential_rub=15000,
            owner_next_step="Если разрыв сохранится — запустить тёплый спрос.",
            action_job="cycle",
            created_by=948205934,
        )
        center = owner_ai.command_center()
        control = [
            item for item in center["control_queue"]
            if item.get("source") == "owner_control"
        ]

        self.assertTrue(created["ok"])
        self.assertEqual(created["control_item"]["status"], "high")
        self.assertTrue(control)
        self.assertEqual(control[0]["title"], "Проверить план-факт вечером")
        self.assertEqual(control[0]["potential_rub"], 15000)
        self.assertEqual(created["control_item"]["action_job"], "cycle")
        self.assertEqual(control[0]["action_job"], "cycle")
        self.assertIn("тёплый спрос", control[0]["owner_next_step"])

    def test_owner_control_task_surfaces_linked_action_status(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Запустить тёплый спрос",
            detail="Добрать свободные окна.",
            priority="medium",
            due_in_days=2,
            action_job="cycle",
        )
        linked_action_id = sys.modules["database"].create_owner_action(
            "cycle",
            "Подогреть спрос",
            status="done",
            payload={"source_control_id": created["task_id"]},
        )
        linked_action = [
            row for row in sys.modules["database"].list_owner_actions(limit=20)
            if row.get("id") == linked_action_id
        ][0]
        linked_action["evaluated_at"] = "2026-07-08T11:00:00"
        linked_action["impact_status"] = "positive_signal"
        linked_action["impact"] = {
            "status": "positive_signal",
            "message": "Есть положительный сигнал.",
        }
        task = [
            row for row in sys.modules["database"].list_owner_actions(limit=20)
            if row.get("id") == created["task_id"]
        ][0]
        task["status"] = "running"
        task["payload"].update({
            "linked_action_id": linked_action_id,
            "linked_action_job": "cycle",
            "linked_action_status": "done",
            "linked_action_due_at": "2026-07-10T10:00:00",
        })

        center = owner_ai.command_center()
        item = [
            row for row in center["control_queue"]
            if row.get("action_id") == created["task_id"]
        ][0]

        self.assertEqual(item["linked_action_id"], linked_action_id)
        self.assertEqual(item["linked_action_job"], "cycle")
        self.assertEqual(item["linked_action_status"], "done")
        self.assertEqual(item["linked_action_evaluated_at"], "2026-07-08T11:00:00")
        self.assertEqual(item["linked_action_impact_status"], "positive_signal")
        self.assertIn("положительный", item["linked_action_impact_message"])
        self.assertIn("Можно закрыть контроль", item["owner_next_step"])
        self.assertEqual(center["control_focus"]["items"][0]["action_id"], created["task_id"])
        self.assertEqual(center["control_focus"]["items"][0]["focus_reason"], "ready_to_close")
        self.assertGreaterEqual(center["control_focus"]["summary"]["ready_to_close_count"], 1)

    def test_control_task_from_same_signal_is_not_duplicated(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        first = owner_ai.create_control_task(
            title="День ниже плана",
            detail="Проверить свободные окна.",
            priority="high",
            signal_key="attention:plan_fact",
        )
        second = owner_ai.create_control_task(
            title="День ниже плана",
            detail="Повторный сигнал.",
            priority="high",
            signal_key="attention:plan_fact",
        )

        self.assertTrue(first["ok"])
        self.assertTrue(second["ok"])
        self.assertTrue(second["existing"])
        self.assertEqual(second["task_id"], first["task_id"])
        self.assertEqual(second["control_item"]["title"], "День ниже плана")

    def test_attention_signal_knows_when_it_is_in_control(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})
        initial = owner_ai.command_center()
        signal = [
            row for row in initial["attention_feed"]
            if row.get("source") != "owner_control" and row.get("signal_key")
        ][0]

        created = owner_ai.create_control_task(
            title=signal["title"],
            detail=signal.get("detail") or "",
            priority="high",
            signal_key=signal["signal_key"],
        )
        center = owner_ai.command_center()
        updated = [
            row for row in center["attention_feed"]
            if row.get("signal_key") == signal["signal_key"]
        ][0]

        self.assertTrue(created["ok"])
        self.assertTrue(updated["in_control"])
        self.assertEqual(updated["control_task_id"], created["task_id"])

    def test_owner_control_task_lifecycle_updates_queue(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Проверить просадку",
            priority="medium",
            due_in_days=1,
        )
        postponed = owner_ai.update_control_task(
            task_id=created["task_id"],
            action="postpone",
            due_in_days=2,
        )
        center_after_postpone = owner_ai.command_center()
        completed = owner_ai.update_control_task(
            task_id=created["task_id"],
            action="complete",
            note="Проверено",
        )
        center_after_complete = owner_ai.command_center()

        self.assertTrue(postponed["ok"])
        self.assertEqual(postponed["task"]["status"], "pending")
        self.assertTrue([
            item for item in center_after_postpone["control_queue"]
            if item.get("action_id") == created["task_id"]
        ])
        self.assertTrue(completed["ok"])
        self.assertEqual(completed["task"]["status"], "done")
        self.assertFalse([
            item for item in center_after_complete["control_queue"]
            if item.get("action_id") == created["task_id"]
        ])

    def test_owner_control_task_can_be_assigned(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Проверить пустые окна",
            priority="medium",
            due_in_days=1,
            assigned_to="admin",
            assignee_name="смена",
        )
        center = owner_ai.command_center()
        task = [
            row for row in center["task_center"]["tasks"]
            if row.get("control_action_id") == created["task_id"]
        ][0]
        updated = owner_ai.update_control_task(
            task_id=created["task_id"],
            action="assign",
            assigned_to="master",
            assignee_name="старший",
        )
        center_after_assign = owner_ai.command_center()
        reassigned = [
            row for row in center_after_assign["task_center"]["tasks"]
            if row.get("control_action_id") == created["task_id"]
        ][0]

        self.assertTrue(created["ok"])
        self.assertEqual(task["assigned_to"], "admin")
        self.assertEqual(task["assignment_delivery_channel"], "team_chat")
        self.assertEqual(task["assignment_delivery_state"], "queued")
        self.assertIn("Админ", task["assigned_label"])
        self.assertTrue(updated["ok"])
        self.assertEqual(reassigned["assigned_to"], "master")
        self.assertEqual(reassigned["assignment_delivery_channel"], "team_chat")
        self.assertEqual(reassigned["assignment_delivery_state"], "queued")
        self.assertIn("Мастер", reassigned["assigned_label"])
        self.assertIn("старший", reassigned["assigned_label"])

    def test_staff_task_inbox_is_role_scoped_and_updates_work_state(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Проверить окна администратора",
            priority="medium",
            due_in_days=1,
            assigned_to="admin",
            assignee_name="смена",
        )
        manager_inbox = owner_ai.staff_task_inbox(viewer_role="manager")
        master_inbox = owner_ai.staff_task_inbox(viewer_role="master")
        accepted = owner_ai.update_staff_task(
            task_id=created["task_id"],
            viewer_role="manager",
            actor_name="Админ",
            actor_chat_id=1,
            action="accept",
        )
        owner_center = owner_ai.command_center()
        center_task = [
            row for row in owner_center["task_center"]["tasks"]
            if row.get("control_action_id") == created["task_id"]
        ][0]

        self.assertEqual(len(manager_inbox["tasks"]), 1)
        self.assertEqual(manager_inbox["tasks"][0]["assigned_to"], "admin")
        self.assertEqual(master_inbox["tasks"], [])
        self.assertTrue(accepted["ok"])
        self.assertEqual(accepted["task"]["work_state"], "accepted")
        self.assertEqual(center_task["assignment_work_state"], "accepted")
        self.assertEqual(center_task["lane"], "running")

    def test_owner_can_return_done_assignment_for_revision(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Проверить карточки клиентов",
            priority="medium",
            due_in_days=1,
            assigned_to="admin",
            assignee_name="админ",
        )
        done = owner_ai.update_staff_task(
            task_id=created["task_id"],
            viewer_role="manager",
            actor_name="Админ",
            actor_chat_id=1,
            action="done",
        )
        center_ready = owner_ai.command_center()
        review_ready = [
            row for row in center_ready["owner_review"]["items"]
            if row.get("control_action_id") == created["task_id"]
        ][0]
        returned = owner_ai.update_control_task(
            task_id=created["task_id"],
            action="revision",
            note="Нужно проверить ещё раз",
        )
        inbox = owner_ai.staff_task_inbox(viewer_role="manager")
        center = owner_ai.command_center()
        center_task = [
            row for row in center["task_center"]["tasks"]
            if row.get("control_action_id") == created["task_id"]
        ][0]
        review_after_return = [
            row for row in center["owner_review"]["items"]
            if row.get("control_action_id") == created["task_id"]
        ][0]

        self.assertTrue(done["ok"])
        self.assertEqual(done["task"]["work_state"], "done")
        self.assertEqual(review_ready["review_state"], "ready")
        self.assertEqual(review_ready["next_actions"], ["complete", "revision", "postpone"])
        self.assertTrue(returned["ok"])
        self.assertEqual(returned["task"]["payload"]["assignment_work_state"], "revision")
        self.assertEqual(inbox["tasks"][0]["work_state"], "revision")
        self.assertEqual(inbox["tasks"][0]["next_actions"], ["start", "done"])
        self.assertEqual(center_task["assignment_work_state"], "revision")
        self.assertEqual(center_task["lane"], "running")
        self.assertEqual(review_after_return["review_state"], "revision")

    def test_overdue_owner_control_task_is_urgent(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        created = owner_ai.create_control_task(
            title="Просроченный контроль",
            priority="low",
            due_at="2020-01-01T10:00:00",
        )
        center = owner_ai.command_center()
        item = [
            row for row in center["control_queue"]
            if row.get("action_id") == created["task_id"]
        ][0]
        control_section = [
            section for section in center["sections"]
            if section.get("key") == "control"
        ][0]

        self.assertEqual(item["status"], "high")
        self.assertEqual(item["due_state"], "overdue")
        self.assertIn("Срок контроля прошёл", item["owner_next_step"])
        self.assertGreaterEqual(control_section["summary"]["overdue_count"], 1)
        self.assertTrue([
            row for row in center["attention_feed"]
            if row.get("kind") == "control_overdue"
            and row.get("control_key") == item.get("key")
        ])

    def test_plan_fact_uses_manual_owner_target_when_set(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        sys.modules["database"].get_setting = lambda key, default=None: (
            "45000" if key == "owner_daily_target_rub" else default
        )

        plan = owner_ai.plan_fact(snap={
            "date": "2026-07-08",
            "booked_today": 2,
            "expected_revenue_rub": 4000,
            "avg_check_rub": 2000,
        })

        self.assertEqual(plan["target_source"], "manual_setting")
        self.assertEqual(plan["daily_target_rub"], 45000)
        self.assertEqual(plan["needed_visits_to_target"], 21)

    def test_master_performance_ranks_profit_after_salary(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        perf = owner_ai.master_performance()

        self.assertEqual(perf["top_profit_master"]["name"], "Мастер 1")
        self.assertEqual(perf["top_gross_master"]["name"], "Мастер 1")
        self.assertEqual(perf["profit_after_salary_total_rub"], 38000)
        self.assertIn("общие расходы", perf["note"])

    def test_expiring_assets_counts_only_sold_certificates(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        assets = owner_ai.expiring_assets()

        self.assertEqual(assets["subscriptions_expiring_7d"], 2)
        self.assertEqual(assets["gift_certs_active_count"], 1)
        self.assertEqual(assets["gift_certs_active_value_rub"], 10000)
        self.assertIn("ПРОДАННЫЕ", assets["note"])


if __name__ == "__main__":
    unittest.main()
