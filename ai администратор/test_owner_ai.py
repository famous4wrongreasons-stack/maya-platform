import importlib
import json
import sys
import types
import unittest
from datetime import date, timedelta


def _load_owner_ai(
    *,
    reactivation_payload: dict | None,
    cycle_payload: dict | None = None,
    schedule_rows: list[dict] | None = None,
    schedule_references: dict[str, dict] | None = None,
):
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
        return {
            "total_gross": 4000,
            "visits": 3,
            "avg_check": 1333,
            "masters": [
                {
                    "staff_id": 2,
                    "name": "Мастер 2",
                    "gross": 3000,
                    "salary": 1200,
                    "visits": 2,
                    "is_owner": False,
                },
                {
                    "staff_id": 1,
                    "name": "Мастер 1",
                    "gross": 1000,
                    "salary": 0,
                    "visits": 1,
                    "is_owner": True,
                },
            ],
        }

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
    settings = {}
    def fake_get_setting(key, default=None):
        if key == "reactivation_last" and reactivation_payload is not None:
            return json.dumps(reactivation_payload, ensure_ascii=False)
        if key == "cycle_candidates_snapshot_v1" and cycle_payload is not None:
            return json.dumps(cycle_payload, ensure_ascii=False)
        return settings.get(key, default)

    def fake_set_setting(key, value):
        settings[key] = value

    fake_database.get_setting = fake_get_setting
    fake_database.set_setting = fake_set_setting
    fake_database.get_client_by_id = lambda client_id: {
        11: {"id": 11, "name": "Иван Петров", "phone": "+7 999 111-22-33"},
        12: {"id": 12, "name": "Максим Сидоров", "phone": "+7 999 444-55-66"},
    }.get(int(client_id))
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
            return schedule_rows if schedule_rows is not None else [
                {"id": 1, "name": "Мастер 1", "is_working": True},
                {"id": 2, "name": "Мастер 2", "is_working": True},
            ]

        def get_company_records(self, start_date, end_date):
            return [{"staff_id": 1}, {"staff_id": 1}]

    fake_yclients.YClientsAPI = _FakeYClientsAPI
    fake_yclients.get_schedule_reference = lambda name, day: (
        (schedule_references or {}).get(name)
        or {
            "configured": False,
            "hours": None,
            "is_working": None,
            "updated": None,
        }
    )

    fake_growth_planner = types.ModuleType("growth_planner")
    fake_growth_planner.get_growth_plan = lambda **kwargs: {
        "version": "maya_growth_plan_v1",
        "as_of": "2026-07-08",
        "status": "ok",
        "goal": {
            "requested_target_rub": 100000,
            "committed_target_rub": 100000,
            "planning_confidence_pct": 95,
        },
        "plan_fact": {"actual_rub": 40000, "projected_rub": 70000, "progress_pct": 40},
        "capacity": {"theoretical_max_gross_rub": 150000, "realistic_95_ceiling_rub": 120000},
        "client_segments": {"active_clients": 30, "recoverable_clients": 10},
        "masters": [],
        "actions": [],
    }
    sys.modules["analytics"] = fake_analytics
    sys.modules["database"] = fake_database
    sys.modules["yclients"] = fake_yclients
    sys.modules["growth_planner"] = fake_growth_planner
    sys.modules.pop("owner_ai", None)
    mod = importlib.import_module("owner_ai")
    mod._avg_cache.update(val=None, ts=0.0)
    mod._summary30_cache.update(val=None, ts=0.0)
    mod._today_master_cache.update(date=None, val=None, ts=0.0)
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

        self.assertFalse(result['available'])
        self.assertEqual(result['reason'], 'qualified_c8_tenant_read_required')
        self.assertIsNone(result['count'])
        self.assertIsNone(result['potential_return_revenue_rub'])
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['decision_options'], [])

    def test_legacy_cycle_queue_cannot_expose_contacts_or_qualify_c8(self):
        cycle_payload = {
            "version": "maya_cycle_candidates_v1",
            "generated_at": date.today().isoformat() + "T09:00:00",
            "mode": "scan",
            "summary": {
                "candidates": 2, "pending": 2, "overdue": 1,
                "due": 1, "due_soon": 0, "sent": 0,
            },
            "owner_alert": {
                "version": "maya_cycle_owner_alert_v1",
                "event_id": "cycle-20260711T090000-test",
                "active": True,
                "state": "new",
                "candidate_count": 2,
                "new_count": 2,
                "created_at": date.today().isoformat() + "T09:00:00",
                "notify_required": False,
            },
            "candidates": [{
                "client_id": 11,
                "cycle_days": 28,
                "last_visit": "2026-06-08",
                "predicted_visit": "2026-07-06",
                "days_from_due": 2,
                "urgency": "due",
                "reason": "привычный срок прошёл 2 дн. назад · цикл 28 дн.",
                "last_master": "Мастер 1",
                "eligible_channels": ["telegram", "phone"],
                "contact_status": "pending",
            }, {
                "client_id": 12,
                "cycle_days": 21,
                "last_visit": "2026-06-10",
                "predicted_visit": "2026-07-01",
                "days_from_due": 7,
                "urgency": "overdue",
                "reason": "привычный срок прошёл 7 дн. назад · цикл 21 дн.",
                "last_master": "Мастер 2",
                "eligible_channels": ["telegram", "phone"],
                "contact_status": "pending",
            }],
        }
        owner_ai = _load_owner_ai(
            reactivation_payload={"count": 5, "at": date.today().isoformat()},
            cycle_payload=cycle_payload,
        )

        llm_view = owner_ai.return_candidates()
        owner_view = owner_ai.return_candidates(include_personal_data=True)

        # C8 L08: neither an owner UI flag nor old SQLite candidates qualify C8 evidence.
        for view in (llm_view, owner_view):
            self.assertFalse(view['available'])
            self.assertEqual(view['reason'], 'qualified_c8_tenant_read_required')
            self.assertEqual(view['candidates'], [])
            self.assertEqual(view['decision_options'], [])
            self.assertIsNone(view['cycle_due_count'])
            self.assertIsNone(view['cycle_potential_return_revenue_rub'])
            self.assertNotIn('Иван', json.dumps(view, ensure_ascii=False))
            self.assertNotIn('tel:', json.dumps(view))

    def test_daily_briefing_keeps_schedule_facts_without_legacy_strategy(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        brief = owner_ai.daily_briefing()

        self.assertEqual(brief["today"]["booked"], 2)
        self.assertIsNone(brief["today"]["avg_check_rub"])
        self.assertIsNone(brief["today"]["expected_revenue_rub"])
        self.assertIsNone(brief["today"]["free_capacity_today"])
        self.assertEqual(
            [
                row["name"]
                for row in brief["today"]["staff_schedule"]["working"]
            ],
            ["Мастер 1", "Мастер 2"],
        )
        self.assertEqual(
            [
                row["name"]
                for row in brief["today"]["staff_schedule"]["confirmed_working"]
            ],
            ["Мастер 1", "Мастер 2"],
        )
        self.assertEqual(brief["today"]["staff_schedule"]["status"], "verified")
        self.assertFalse(brief["grounding_contract"]["infer_staff_names"])
        self.assertIsNone(brief['top_priority'])
        self.assertIsNone(brief['top_action'])
        self.assertEqual(brief['next_best_actions'], [])
        self.assertFalse(brief['owner_advisor']['available'])

    def test_daily_briefing_marks_baseline_schedule_conflict(self):
        owner_ai = _load_owner_ai(
            reactivation_payload=None,
            schedule_references={
                "Мастер 1": {
                    "configured": True,
                    "hours": "10:00-21:00",
                    "is_working": True,
                    "updated": "2026-07-01",
                },
                "Мастер 2": {
                    "configured": True,
                    "hours": None,
                    "is_working": False,
                    "updated": "2026-07-01",
                },
            },
        )

        brief = owner_ai.daily_briefing()
        schedule = brief["today"]["staff_schedule"]

        self.assertEqual(schedule["status"], "conflict")
        self.assertEqual(
            [row["name"] for row in schedule["confirmed_working"]],
            ["Мастер 1"],
        )
        self.assertEqual(schedule["conflicts"][0]["name"], "Мастер 2")
        self.assertEqual(schedule["conflicts"][0]["yclients_status"], "working")
        self.assertEqual(schedule["conflicts"][0]["baseline_status"], "off")
        self.assertEqual(brief["today"]["confirmed_working_masters"], 1)
        self.assertIsNone(brief["today"]["free_capacity_today"])
        self.assertNotIn("Мастер 2", brief["today"]["idle_masters"])

    def test_daily_briefing_formatter_uses_only_verified_schedule_groups(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        brief = {
            "date": "2026-07-16",
            "today": {
                "booked": 21,
                "expected_revenue_rub": 41900,
                "avg_check_rub": 2069,
                "free_capacity_today": 3,
                "staff_schedule": {
                    "confirmed_working": [
                        {
                            "name": "Алексей Дарма",
                            "work_start": "10:00",
                            "work_end": "21:00",
                        },
                        {
                            "name": "Максим Чурсинов",
                            "work_start": "10:00",
                            "work_end": "21:00",
                        },
                    ],
                    "confirmed_off": [{"name": "Стас Мосин"}],
                    "unknown": [],
                    "conflicts": [
                        {
                            "name": "Илья Третьяков",
                            "yclients_status": "working",
                            "yclients_hours": "12:00-21:00",
                            "baseline_status": "off",
                            "records_today": 7,
                        },
                    ],
                },
            },
            "week_trend": {
                "gross": {"delta_pct": -10},
                "visits": {"delta_pct": -10},
            },
            "top_risk": {
                "detail": "Текущая неделя к прошлой: -10% по выручке.",
            },
            "top_priority": {
                "detail": "Вернуть клиентов с наступившим циклом.",
            },
        }

        text = owner_ai.format_daily_briefing(brief)

        self.assertIn("Работают подтверждённо: Алексей Дарма", text)
        self.assertIn("Максим Чурсинов", text)
        self.assertIn("Выходные подтверждены: Стас Мосин", text)
        self.assertIn("Илья Третьяков", text)
        self.assertIn("YClients показывает смену 12:00–21:00", text)
        self.assertIn("базовый график показывает выходной", text)
        self.assertIn("записей на день: 7", text)
        self.assertNotIn("41 900 ₽", text)
        self.assertIn("Прогноз выручки недоступен", text)
        self.assertNotIn("ты, Илья", text)

    def test_single_free_slot_cannot_create_unqualified_money_or_risk(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        snap = {
            "free_capacity_today": 1,
            "potential_fill_revenue_rub": 2000,
            "idle_masters": [],
            "underused_masters": [],
            "week_trend": {},
        }

        self.assertEqual(owner_ai.money_opportunities(snap=snap, exp={}, ret={}), [])
        risks = owner_ai.risk_signals(snap=snap, exp={}, ret={}, svc={})
        self.assertFalse(risks['available'])
        self.assertEqual(risks['risks'], [])

    def test_command_center_builds_stable_owner_os_contract(self):
        owner_ai = _load_owner_ai(reactivation_payload={"count": 10, "at": "2026-07-07"})

        center = owner_ai.command_center()

        self.assertEqual(center['version'], 'owner_command_center_v1')
        self.assertTrue(center['read_only'])
        self.assertEqual(center['summary']['booked_today'], 2)
        for key in ('money_at_stake_rub', 'free_capacity_today', 'daily_target_rub', 'plan_progress_pct'):
            self.assertIsNone(center['summary'][key])
        # Readable source observations remain; parallel C8 scores/strategies do not.
        self.assertEqual(center['master_performance']['top_profit_master']['profit_after_salary_rub'], 26000)
        for key in ('kpi_scorecard', 'financial_director', 'business_goals', 'owner_advisor', 'growth_engine'):
            self.assertFalse(center[key]['available'])
            self.assertIsNone(center[key]['score'])
            self.assertEqual(center[key]['reason'], 'qualified_c8_tenant_read_required')
        self.assertEqual(center['next_best_actions'], [])
        self.assertEqual(center['journal'], [])
        self.assertEqual(center['client_retention']['version'], 'c8.legacy.unavailable/1')


    def test_autonomous_director_tick_creates_only_internal_control_tasks(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.run_autonomous_director_tick(**{'limit': 2})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_autopilot_supervision_starts_maya_task_and_creates_escalation(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.run_autopilot_supervision_tick(**{'limit': 3})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_execution_loop_tick_creates_owner_followup_without_duplicates(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.run_execution_loop_tick(**{'limit': 2})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_operating_rhythm_tick_runs_safe_layers_and_respects_cooldown(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.run_operating_rhythm_tick(**{'force': True})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

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
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.create_control_task(**{'title': 'Count', 'assigned_to': 'owner'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_owner_control_task_surfaces_linked_action_status(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.create_control_task(**{'title': 'Run job', 'action_job': 'cycle'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_control_task_from_same_signal_is_not_duplicated(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.create_control_task(**{'title': 'Signal', 'signal_key': 'same-signal'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_attention_signal_knows_when_it_is_in_control(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.create_control_task(**{'title': 'Signal', 'safe_autocreate': True})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_owner_control_task_lifecycle_updates_queue(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.update_control_task(**{'task_id': 7, 'action': 'complete'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_owner_control_task_can_be_assigned(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.update_control_task(**{'task_id': 7, 'action': 'assign', 'assigned_to': 'admin'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_staff_task_inbox_is_role_scoped_and_updates_work_state(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.update_staff_task(**{'task_id': 7, 'viewer_role': 'master', 'action': 'done'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_owner_can_return_done_assignment_for_revision(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.update_control_task(**{'task_id': 7, 'action': 'revision'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_overdue_owner_control_task_is_urgent(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        before = list(sys.modules["database"].list_owner_actions())
        for _ in range(2):
            result = owner_ai.create_control_task(**{'title': 'Overdue', 'due_at': '2020-01-01'})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "canonical_operational_work_required")
            self.assertEqual(result["business_mutations"], 0)
        self.assertEqual(sys.modules["database"].list_owner_actions(), before)

    def test_legacy_manual_target_cannot_replace_a22(self):
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

        # A22 owns targets; legacy settings cannot be promoted to a measured plan.
        self.assertFalse(plan['available'])
        self.assertEqual(plan['target_source'], 'canonical_a22_required')
        for key in ('daily_target_rub', 'actual_revenue_rub', 'projected_revenue_rub', 'progress_pct', 'confidence'):
            self.assertIsNone(plan[key])

    def test_weekday_history_cannot_create_uncalibrated_forecast(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        target = date.today()
        rows = []
        for offset in range(29, -1, -1):
            day = target - timedelta(days=offset)
            rows.append({
                "date": day.isoformat(),
                "weekday": day.weekday(),
                "gross_rub": 5000 if day.weekday() == target.weekday() else 1000,
                "paid_visits": 2,
            })
        owner_ai._summary30_cache.update(val={
            "total_gross": sum(row["gross_rub"] for row in rows),
            "avg_check": 2000,
            "daily": rows,
        }, ts=owner_ai.time.time())

        plan = owner_ai.plan_fact(snap={
            "date": target.isoformat(),
            "booked_today": 3,
            "expected_revenue_rub": 6000,
            "forecast_low_rub": 5200,
            "forecast_high_rub": 6800,
            "potential_revenue_rub": 12000,
            "upsell_potential_rub": 800,
            "potential_fill_revenue_rub": 5200,
            "avg_check_rub": 2000,
        })

        # C8 L08: weekday history does not authorize an uncalibrated numeric forecast.
        self.assertFalse(plan['available'])
        self.assertEqual(plan['target_source'], 'canonical_a22_required')
        for key in ('daily_target_rub', 'expected_revenue_rub', 'projected_revenue_rub', 'progress_pct', 'confidence'):
            self.assertIsNone(plan[key])

    def test_legacy_growth_engine_cannot_create_c8_decisions(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        engine = owner_ai._growth_engine(
            snap={"free_capacity_today": 4, "avg_check_rub": 2000},
            plan={"avg_check_rub": 2000, "upsell_potential_rub": 3000},
            ret={},
            retention={"summary": {"churn_candidates": 20, "forward_booking_pct": 10}},
            reputation_payload={"summary": {"negative_reviews_30d": 1}, "recommendations": ["Разобрать ожидание."]},
            market_payload={
                "summary": {"competitors_scanned": 12},
                "recommendations": [{"fact": "Цена около медианы.", "action": "Усилить комплекс.", "confidence": "high"}],
            },
        )

        self.assertFalse(engine['available'])
        self.assertEqual(engine['reason'], 'qualified_c8_tenant_read_required')
        self.assertEqual(engine['decisions'], [])
        self.assertIsNone(engine['score'])

    def test_master_performance_ranks_profit_after_salary(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        perf = owner_ai.master_performance()

        self.assertEqual(perf["top_profit_master"]["name"], "Мастер 1")
        self.assertEqual(perf["top_gross_master"]["name"], "Мастер 1")
        self.assertEqual(perf["profit_after_salary_total_rub"], 38000)
        self.assertIn("общие расходы", perf["note"])

    def test_legacy_retention_cohort_cannot_qualify_c8_measurement(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)
        today = date.today()
        rows = [
            {
                "client": {"id": 1},
                "datetime": (today - timedelta(days=120)).isoformat(),
                "attendance": 1,
            },
            {
                "client": {"id": 2},
                "datetime": (today - timedelta(days=110)).isoformat(),
                "attendance": 1,
            },
            {
                "client": {"id": 1},
                "datetime": (today - timedelta(days=20)).isoformat(),
                "attendance": 1,
            },
            {
                "client": {"id": 1},
                "datetime": (today + timedelta(days=10)).isoformat(),
                "attendance": 0,
            },
        ]
        owner_ai._retention_cache.update(val=None, ts=0.0)
        fake_yclients = sys.modules["yclients"]
        fake_yclients.YClientsAPI.get_company_records = lambda self, start, end: rows

        result = owner_ai.client_retention(force=True)

        self.assertFalse(result['available'])
        self.assertFalse(result['complete'])
        self.assertEqual(result['reason'], 'qualified_c8_tenant_read_required')
        for key in ('previous_cohort_clients', 'returned_clients', 'retention_90d_pct', 'forward_booking_pct'):
            self.assertIsNone(result['summary'][key])
        self.assertEqual(owner_ai.client_retention()['summary'], result['summary'])

    def test_expiring_assets_counts_only_sold_certificates(self):
        owner_ai = _load_owner_ai(reactivation_payload=None)

        assets = owner_ai.expiring_assets()

        self.assertEqual(assets["subscriptions_expiring_7d"], 2)
        self.assertEqual(assets["gift_certs_active_count"], 1)
        self.assertEqual(assets["gift_certs_active_value_rub"], 10000)
        self.assertIn("ПРОДАННЫЕ", assets["note"])


if __name__ == "__main__":
    unittest.main()
