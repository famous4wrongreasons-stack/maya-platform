import unittest
import growth_planner

class C8LegacyGrowthRetirementTests(unittest.TestCase):
    def test_cached_plan_cannot_restore_money_or_strategy(self):
        old={"plan_fact":{"projected_rub":900000},"goal":{"planning_confidence_pct":95},"actions":[{"send":True}]}
        for view in [growth_planner.owner_view,growth_planner.manager_view,lambda x:growth_planner.master_view(x,7)]:
            result=view(old);self.assertFalse(result["available"]);self.assertEqual(result["actions"],[]);self.assertEqual(result["plan_fact"],{})
    def test_personal_cycle_is_not_an_alternative_c8_policy(self):
        result=growth_planner.segment_client_base([{"id":1,"visits":99}],[],avg_check_rub=50000)
        self.assertFalse(result["available"]);self.assertNotIn("recoverable_revenue_potential_rub",result)
    def test_capacity_default_cannot_create_prediction(self):
        result=growth_planner.calculate_capacity(masters=[],schedules={},period_start="2026-09-01",period_end="2026-09-30")
        self.assertFalse(result["available"]);self.assertEqual(result["capacity"],{})
    def test_refresh_remains_unavailable_and_does_not_create_goal(self):
        self.assertFalse(growth_planner.get_growth_plan(force_refresh=True)["available"])
        self.assertFalse(growth_planner.calculate_growth_plan()["available"])
    def test_existing_b13_refusal_is_preserved(self):
        r=growth_planner.set_growth_goal(target_rub=100000)
        self.assertEqual(r["error"],"legacy_business_goal_mutation_retired")
        self.assertEqual(r["canonical_action"],"update_finance_dashboard_preferences")
        self.assertEqual(r["business_mutations"],0)

if __name__=="__main__":unittest.main()
